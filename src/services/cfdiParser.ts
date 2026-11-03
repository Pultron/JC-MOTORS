import type { InvoiceBorrador, InvoiceConcepto, InvoiceImpuesto } from '../models/invoice';
import { bufferToBase64 } from '../utils/base64';

const NS_CFDI = 'http://www.sat.gob.mx/cfd/4';
const NS_TFD = 'http://www.sat.gob.mx/TimbreFiscalDigital';

export class CfdiParseError extends Error {}

const attr = (element: Element | null | undefined, name: string): string => element?.getAttribute(name)?.trim() ?? '';

/** Hijos directos con ese nombre local; evita confundir los Traslado de cada concepto con los del resumen. */
function children(parent: Element | null | undefined, localName: string): Element[] {
  if (!parent) return [];
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

/** Cadena original del complemento de certificación digital (Anexo 20, TFD 1.1). */
function buildCadenaOriginal(tfd: Element): string {
  const parts = [
    attr(tfd, 'Version'),
    attr(tfd, 'UUID'),
    attr(tfd, 'FechaTimbrado'),
    attr(tfd, 'RfcProvCertif'),
    ...(tfd.hasAttribute('Leyenda') ? [attr(tfd, 'Leyenda')] : []),
    attr(tfd, 'SelloCFD'),
    attr(tfd, 'NoCertificadoSAT'),
  ];
  return `||${parts.join('|')}||`;
}

export function parseCfdi(xml: string, nombreArchivo = 'factura.xml'): InvoiceBorrador {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new CfdiParseError('El archivo no es un XML válido.');
  }

  const root = doc.documentElement;
  if (root.localName !== 'Comprobante' || root.namespaceURI !== NS_CFDI) {
    throw new CfdiParseError('El XML no es un CFDI 4.0 (falta el nodo cfdi:Comprobante).');
  }
  const version = attr(root, 'Version');
  if (version !== '4.0') {
    throw new CfdiParseError(`Solo se admiten CFDI versión 4.0${version ? ` (el archivo es versión ${version})` : ''}.`);
  }

  const tfd = doc.getElementsByTagNameNS(NS_TFD, 'TimbreFiscalDigital')[0];
  if (!tfd || !attr(tfd, 'UUID')) {
    throw new CfdiParseError('El CFDI no tiene Timbre Fiscal Digital: no está timbrado por el SAT.');
  }

  const emisor = children(root, 'Emisor')[0];
  const receptor = children(root, 'Receptor')[0];
  if (!emisor || !receptor) throw new CfdiParseError('El CFDI no contiene emisor o receptor.');

  const conceptos: InvoiceConcepto[] = children(children(root, 'Conceptos')[0], 'Concepto').map((concepto) => ({
    claveProdServ: attr(concepto, 'ClaveProdServ'),
    noIdentificacion: attr(concepto, 'NoIdentificacion'),
    cantidad: attr(concepto, 'Cantidad'),
    claveUnidad: attr(concepto, 'ClaveUnidad'),
    unidad: attr(concepto, 'Unidad'),
    descripcion: attr(concepto, 'Descripcion'),
    valorUnitario: attr(concepto, 'ValorUnitario'),
    importe: attr(concepto, 'Importe'),
    descuento: attr(concepto, 'Descuento'),
    objetoImp: attr(concepto, 'ObjetoImp'),
    impuestos: children(children(children(concepto, 'Impuestos')[0], 'Traslados')[0], 'Traslado').map((node) => ({
      impuesto: attr(node, 'Impuesto'),
      tipo: 'Traslado' as const,
      base: attr(node, 'Base'),
      tipoFactor: attr(node, 'TipoFactor'),
      tasaOCuota: attr(node, 'TasaOCuota'),
      importe: attr(node, 'Importe'),
    })),
  }));
  if (conceptos.length === 0) throw new CfdiParseError('El CFDI no contiene conceptos.');

  const resumen = children(root, 'Impuestos')[0];
  const impuestos: InvoiceImpuesto[] = [
    ...children(children(resumen, 'Traslados')[0], 'Traslado').map((node) => ({
      impuesto: attr(node, 'Impuesto'),
      tipo: 'Traslado' as const,
      base: attr(node, 'Base'),
      tipoFactor: attr(node, 'TipoFactor'),
      tasaOCuota: attr(node, 'TasaOCuota'),
      importe: attr(node, 'Importe'),
    })),
    ...children(children(resumen, 'Retenciones')[0], 'Retencion').map((node) => ({
      impuesto: attr(node, 'Impuesto'),
      tipo: 'Retención' as const,
      base: '',
      tipoFactor: '',
      tasaOCuota: '',
      importe: attr(node, 'Importe'),
    })),
  ];

  return {
    uuid: attr(tfd, 'UUID').toUpperCase(),
    serieCSD: attr(root, 'NoCertificado'),
    lugarExpedicion: attr(root, 'LugarExpedicion'),
    fechaEmision: attr(root, 'Fecha'),
    efectoComprobante: attr(root, 'TipoDeComprobante'),
    exportacion: attr(root, 'Exportacion'),
    version,
    moneda: attr(root, 'Moneda'),
    formaPago: attr(root, 'FormaPago'),
    metodoPago: attr(root, 'MetodoPago'),
    emisor: { rfc: attr(emisor, 'Rfc'), nombre: attr(emisor, 'Nombre'), regimenFiscal: attr(emisor, 'RegimenFiscal') },
    receptor: {
      rfc: attr(receptor, 'Rfc'),
      nombre: attr(receptor, 'Nombre'),
      codigoPostal: attr(receptor, 'DomicilioFiscalReceptor'),
      regimenFiscal: attr(receptor, 'RegimenFiscalReceptor'),
      usoCFDI: attr(receptor, 'UsoCFDI'),
    },
    conceptos,
    impuestos,
    subtotal: attr(root, 'SubTotal'),
    totalImpuestosTrasladados: attr(resumen, 'TotalImpuestosTrasladados'),
    totalImpuestosRetenidos: attr(resumen, 'TotalImpuestosRetenidos'),
    total: attr(root, 'Total'),
    timbre: {
      selloCFD: attr(tfd, 'SelloCFD'),
      selloSAT: attr(tfd, 'SelloSAT'),
      cadenaOriginal: buildCadenaOriginal(tfd),
      rfcProvCertif: attr(tfd, 'RfcProvCertif'),
      fechaCertificacion: attr(tfd, 'FechaTimbrado'),
      noCertificadoSAT: attr(tfd, 'NoCertificadoSAT'),
    },
    estado: 'timbrada',
    origen: 'xml',
    archivoOriginal: bufferToBase64(new TextEncoder().encode(xml)),
    archivoTipo: 'xml',
    archivoNombre: nombreArchivo,
    selloIncompleto: false,
    camposDudosos: [],
    confirmadosQr: [],
    revisadoPorUsuario: false,
    importadoEn: new Date().toISOString(),
  };
}
