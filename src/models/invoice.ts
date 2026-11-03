/**
 * Factura (CFDI 4.0) tal como viene del XML. Los importes y tasas se guardan como TEXTO:
 * son los valores del SAT y no deben recalcularse, redondearse ni truncarse.
 */
export interface InvoiceParty {
  rfc: string;
  nombre: string;
  regimenFiscal: string;
}

export interface InvoiceReceptor extends InvoiceParty {
  codigoPostal: string;
  usoCFDI: string;
}

export interface InvoiceConcepto {
  claveProdServ: string;
  noIdentificacion?: string;
  cantidad: string;
  claveUnidad: string;
  unidad: string;
  descripcion: string;
  valorUnitario: string;
  importe: string;
  descuento?: string;
  objetoImp: string;
  /** Impuestos propios del concepto (XML). En PDFs leídos del texto no se conocen por concepto. */
  impuestos?: InvoiceImpuesto[];
}

export interface InvoiceImpuesto {
  impuesto: string;
  tipo: 'Traslado' | 'Retención';
  base: string;
  tipoFactor: string;
  tasaOCuota: string;
  importe: string;
}

export interface InvoiceTimbre {
  selloCFD: string;
  selloSAT: string;
  cadenaOriginal: string;
  rfcProvCertif: string;
  fechaCertificacion: string;
  noCertificadoSAT: string;
}

export type InvoiceOrigen = 'xml' | 'pdf-adjunto' | 'pdf-texto';

/** `campo` es una ruta: "timbre.selloCFD", "receptor.rfc", "conceptos.0.importe", "total"… */
export interface CampoDudoso {
  campo: string;
  motivo: string;
}

export type InvoiceEstado = 'timbrada' | 'cancelada';

export interface Invoice {
  /** Consecutivo interno de JC Motors (no es el folio fiscal). Se asigna una sola vez al importar. */
  folio: number;
  uuid: string;
  serieCSD: string;
  lugarExpedicion: string;
  fechaEmision: string;
  efectoComprobante: string;
  exportacion: string;
  version: string;
  moneda: string;
  formaPago: string;
  metodoPago: string;
  emisor: InvoiceParty;
  receptor: InvoiceReceptor;
  conceptos: InvoiceConcepto[];
  impuestos: InvoiceImpuesto[];
  subtotal: string;
  totalImpuestosTrasladados: string;
  totalImpuestosRetenidos: string;
  total: string;
  timbre: InvoiceTimbre;
  estado: InvoiceEstado;
  /** URL de verificación leída del QR original (PDF); si existe, se reusa tal cual en el PDF nuevo. */
  urlQrOriginal?: string;
  /** true si algún sello no mide 344 caracteres base64: el PDF generado no sería válido. */
  selloIncompleto: boolean;

  // trazabilidad de la importación
  origen: InvoiceOrigen;
  archivoOriginal: string; // base64 del PDF o del XML tal como se subió
  archivoTipo: 'pdf' | 'xml';
  archivoNombre: string;
  camposDudosos: CampoDudoso[];
  /** Campos contrastados con el QR del SAT. */
  confirmadosQr: string[];
  revisadoPorUsuario: boolean;
  importadoEn: string;
}

/** Factura leída, todavía sin folio interno (se asigna al guardar). */
export type InvoiceBorrador = Omit<Invoice, 'folio'>;
