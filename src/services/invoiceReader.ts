import type { CampoDudoso, InvoiceBorrador, InvoiceOrigen } from '../models/invoice';
import { bufferToBase64 } from '../utils/base64';
import { CfdiParseError, parseCfdi } from './cfdiParser';
import { selloValido } from './invoiceValidation';
import { abrirPdf, buscarXmlAdjunto, extraerDeTexto, leerLineas, leerQr } from './pdfInvoice';

export interface LecturaFactura {
  datos: InvoiceBorrador;
  origen: InvoiceOrigen;
  camposDudosos: CampoDudoso[];
}

/** Por debajo de esto el PDF es una imagen escaneada: no hay capa de texto confiable. */
const MIN_CARACTERES_TEXTO = 200;

/** Único punto de entrada: XML directo → PDF con XML adjunto → PDF por capa de texto (+ QR). */
export async function leerFactura(file: File): Promise<LecturaFactura> {
  const lectura = await leer(file);
  lectura.datos.selloIncompleto = !selloValido(lectura.datos.timbre.selloCFD) || !selloValido(lectura.datos.timbre.selloSAT);
  return lectura;
}

async function leer(file: File): Promise<LecturaFactura> {
  const nombre = file.name.toLowerCase();

  if (nombre.endsWith('.xml')) {
    return { datos: parseCfdi(await file.text(), file.name), origen: 'xml', camposDudosos: [] };
  }
  if (!nombre.endsWith('.pdf')) throw new CfdiParseError('Solo se aceptan archivos PDF o XML.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  let pdf;
  try {
    pdf = await abrirPdf(bytes);
  } catch {
    throw new CfdiParseError('No se pudo abrir el PDF: el archivo está dañado o protegido.');
  }

  const xmlAdjunto = await buscarXmlAdjunto(pdf);
  if (xmlAdjunto) {
    const datos: InvoiceBorrador = {
      ...parseCfdi(xmlAdjunto, file.name),
      origen: 'pdf-adjunto',
      archivoOriginal: bufferToBase64(bytes),
      archivoTipo: 'pdf',
    };
    return { datos, origen: 'pdf-adjunto', camposDudosos: [] };
  }

  const lineas = await leerLineas(pdf);
  if (lineas.reduce((suma, linea) => suma + linea.texto.length, 0) < MIN_CARACTERES_TEXTO) {
    throw new CfdiParseError('Este PDF no tiene texto seleccionable (parece escaneado). Sube el XML de la factura.');
  }
  const qr = await leerQr(pdf);
  const { invoice } = extraerDeTexto(lineas, qr, { bytes, nombre: file.name });
  if (!invoice.uuid) throw new CfdiParseError('No se encontró el folio fiscal (UUID) en el PDF. Sube el XML de la factura.');
  return { datos: invoice, origen: 'pdf-texto', camposDudosos: invoice.camposDudosos };
}
