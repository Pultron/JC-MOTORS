import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import monoRegularUrl from '../assets/fonts/IBMPlexMono-Regular.ttf?url';
import monoSemiBoldUrl from '../assets/fonts/IBMPlexMono-SemiBold.ttf?url';
import sansBoldUrl from '../assets/fonts/IBMPlexSans-Bold.ttf?url';
import sansRegularUrl from '../assets/fonts/IBMPlexSans-Regular.ttf?url';
import type { Invoice, InvoiceConcepto, InvoiceImpuesto } from '../models/invoice';
import { bufferToBase64 } from '../utils/base64';
import { formatearFolio, formatFechaHora, formatMoney, formatSat, nombreArchivoFactura, urlVerificacionSat } from '../utils/invoiceFormat';
import { numeroALetras } from '../utils/numeroALetras';
import {
  CLAVE_UNIDAD, EXPORTACION, FORMA_PAGO, IMPUESTO, METODO_PAGO, OBJETO_IMP, REGIMEN_FISCAL, TIPO_COMPROBANTE, USO_CFDI, conDescripcion,
} from './satCatalogs';

const NAVY = '#1C3A5E';
const ORANGE = '#F97316';
const TXT = '#15202B';
const MUTE = '#64748B';
const FAINT = '#8697AB';
const PANEL = '#EDF1F6';
const SEAL_BG = '#F6F8FB';
const BORDER = '#D4DBE4';
const TOTAL_ORANGE = '#FFB071';

const PAGE_W = 210;
const MARGEN = 14;
const DERECHA = 196;
const ANCHO = 182;
const INTERLINEA = 2.2;
const LIMITE_Y = 283;
const Y_INICIO = 20;

export interface PdfTextTrace { page: number; text: string }
export interface InvoicePdfResult { file: File; pages: number; trace: PdfTextTrace[]; nombre: string }

interface Ctx { doc: jsPDF; y: number; trace: PdfTextTrace[] }

// ---------------------------------------------------------------- recursos
interface Assets { sans: string; sansBold: string; mono: string; monoBold: string; logo: string }
let assetsPromise: Promise<Assets> | undefined;

async function fetchBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar el recurso ${url}`);
  return bufferToBase64(await response.arrayBuffer());
}

/** El PNG de marca pesa casi 1 MB: se reduce a 320 px antes de incrustarlo en cada PDF. */
async function loadLogo(): Promise<string> {
  const response = await fetch('/jc-motors-logo.png');
  if (!response.ok) throw new Error('No se pudo cargar el logo');
  const bitmap = await createImageBitmap(await response.blob());
  const size = 320;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar el logo');
  context.drawImage(bitmap, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

function loadAssets(): Promise<Assets> {
  assetsPromise ??= Promise.all([
    fetchBase64(sansRegularUrl), fetchBase64(sansBoldUrl), fetchBase64(monoRegularUrl), fetchBase64(monoSemiBoldUrl), loadLogo(),
  ])
    .then(([sans, sansBold, mono, monoBold, logo]) => ({ sans, sansBold, mono, monoBold, logo }))
    .catch((error) => { assetsPromise = undefined; throw error; });
  return assetsPromise;
}

// ---------------------------------------------------------------- helpers de dibujo
type Familia = 'PlexSans' | 'PlexMono' | 'courier';
type Estilo = 'normal' | 'bold';

function fuente(ctx: Ctx, familia: Familia, estilo: Estilo, size: number, color: string) {
  ctx.doc.setFont(familia, estilo).setFontSize(size).setTextColor(color);
}

function texto(ctx: Ctx, valor: string, x: number, y: number, opciones?: { align?: 'left' | 'right' | 'center'; charSpace?: number }) {
  if (!valor) return;
  ctx.doc.text(valor, x, y, opciones);
  ctx.trace.push({ page: ctx.doc.getCurrentPageInfo().pageNumber, text: valor });
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string | null, opciones: { border?: string; radius?: number } = {}) {
  const { doc } = ctx;
  if (fill) doc.setFillColor(fill);
  if (opciones.border) doc.setDrawColor(opciones.border).setLineWidth(0.2);
  const style = fill && opciones.border ? 'FD' : fill ? 'F' : 'S';
  if (opciones.radius) doc.roundedRect(x, y, w, h, opciones.radius, opciones.radius, style);
  else doc.rect(x, y, w, h, style);
}

function bandaSuperior(ctx: Ctx) {
  rect(ctx, 0, 0, 115, 2, NAVY);
  rect(ctx, 115, 0, PAGE_W - 115, 2, ORANGE);
}

function bandaInferior(ctx: Ctx) {
  rect(ctx, 0, 297 - 1.5, 95, 1.5, ORANGE);
  rect(ctx, 95, 297 - 1.5, PAGE_W - 95, 1.5, NAVY);
}

function nuevaPagina(ctx: Ctx) {
  ctx.doc.addPage();
  bandaSuperior(ctx);
  ctx.y = Y_INICIO;
}

/** Si el bloque (ya medido) no cabe, salta de página. Devuelve true si saltó. */
function asegurarEspacio(ctx: Ctx, alto: number): boolean {
  if (ctx.y + alto <= LIMITE_Y || ctx.y <= Y_INICIO) return false;
  nuevaPagina(ctx);
  return true;
}

function envolver(ctx: Ctx, valor: string, ancho: number): string[] {
  return ctx.doc.splitTextToSize(valor, ancho) as string[];
}

const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Título de sección: 6.5pt bold navy y una línea que se desvanece de navy a borde. */
function tituloSeccion(ctx: Ctx, valor: string, x = MARGEN, ancho = ANCHO) {
  fuente(ctx, 'PlexSans', 'bold', 6.5, NAVY);
  texto(ctx, valor, x, ctx.y + 2.5);
  const inicio = x + ctx.doc.getTextWidth(valor) + 2;
  const [r1, g1, b1] = hexRgb(NAVY);
  const [r2, g2, b2] = hexRgb(BORDER);
  const pasos = 24;
  const largo = x + ancho - inicio;
  for (let i = 0; i < pasos && largo > 0; i++) {
    const t = i / (pasos - 1);
    ctx.doc.setDrawColor(Math.round(r1 + (r2 - r1) * t), Math.round(g1 + (g2 - g1) * t), Math.round(b1 + (b2 - b1) * t)).setLineWidth(0.3);
    ctx.doc.line(inicio + (largo * i) / pasos, ctx.y + 2.2, inicio + (largo * (i + 1)) / pasos, ctx.y + 2.2);
  }
  ctx.y += 5;
}

// ---------------------------------------------------------------- bloques
function dibujarEncabezado(ctx: Ctx, invoice: Invoice, logo: string) {
  const { doc } = ctx;
  doc.addImage(logo, 'PNG', MARGEN, 12, 18, 18);
  const x = MARGEN + 18 + 4;

  fuente(ctx, 'PlexSans', 'bold', 14, NAVY);
  texto(ctx, 'JC Motors', x, 19.5);
  fuente(ctx, 'PlexSans', 'normal', 7.5, MUTE);
  texto(ctx, 'Taller Automotriz · Culiacán, Sinaloa, México', x, 24);

  fuente(ctx, 'PlexSans', 'bold', 15, NAVY);
  texto(ctx, 'FACTURA', DERECHA, 18, { align: 'right' });

  const numero = formatearFolio(invoice.folio);
  fuente(ctx, 'PlexMono', 'bold', 12, ORANGE);
  const anchoNumero = doc.getTextWidth(numero);
  texto(ctx, numero, DERECHA, 24.5, { align: 'right' });
  fuente(ctx, 'PlexSans', 'normal', 6.5, FAINT);
  texto(ctx, 'FOLIO INTERNO', DERECHA - anchoNumero - 2, 24.5, { align: 'right' });

  ctx.y = 35;
  doc.setDrawColor(BORDER).setLineWidth(0.3).line(MARGEN, ctx.y, DERECHA, ctx.y);
  ctx.y += 5;
}

interface CeldaDato { rotulo: string; valor: string; mono?: boolean }

/** Una columna de la rejilla etiqueta/valor: etiqueta arriba, valor debajo. Devuelve el alto usado. */
function columnaDatos(ctx: Ctx, filas: CeldaDato[], x: number, y0: number, ancho: number): number {
  let y = y0;
  for (const fila of filas) {
    fuente(ctx, 'PlexSans', 'bold', 6.5, MUTE);
    texto(ctx, fila.rotulo, x, y);
    if (fila.mono) fuente(ctx, 'PlexMono', 'normal', 7.5, TXT);
    else fuente(ctx, 'PlexSans', 'normal', 7.5, TXT);
    const lineas = envolver(ctx, fila.valor || ' ', ancho);
    lineas.forEach((linea, i) => texto(ctx, linea, x, y + 3.4 + i * 3.2));
    y += 3.4 + lineas.length * 3.2 + 1.2;
  }
  return y - y0;
}

function dibujarRejilla(ctx: Ctx, invoice: Invoice) {
  const ancho = 89;
  const xDer = MARGEN + ancho + 4;
  const izquierda: CeldaDato[] = [
    { rotulo: 'RFC emisor', valor: invoice.emisor.rfc, mono: true },
    { rotulo: 'Nombre emisor', valor: invoice.emisor.nombre },
    { rotulo: 'RFC receptor', valor: invoice.receptor.rfc, mono: true },
    { rotulo: 'Nombre receptor', valor: invoice.receptor.nombre },
    { rotulo: 'Código postal del receptor', valor: invoice.receptor.codigoPostal, mono: true },
    { rotulo: 'Régimen fiscal receptor', valor: conDescripcion(REGIMEN_FISCAL, invoice.receptor.regimenFiscal) },
    { rotulo: 'Uso CFDI', valor: conDescripcion(USO_CFDI, invoice.receptor.usoCFDI) },
  ];
  const derecha: CeldaDato[] = [
    { rotulo: 'Folio fiscal:', valor: invoice.uuid, mono: true },
    { rotulo: 'No. de serie del CSD', valor: invoice.serieCSD, mono: true },
    { rotulo: 'Código postal, fecha y hora de emisión', valor: `${invoice.lugarExpedicion} ${formatFechaHora(invoice.fechaEmision)}`, mono: true },
    { rotulo: 'Efecto de comprobante', valor: conDescripcion(TIPO_COMPROBANTE, invoice.efectoComprobante) },
    { rotulo: 'Régimen fiscal', valor: conDescripcion(REGIMEN_FISCAL, invoice.emisor.regimenFiscal) },
    { rotulo: 'Exportación', valor: conDescripcion(EXPORTACION, invoice.exportacion) },
  ];
  const y0 = ctx.y + 2;
  const altoIzq = columnaDatos(ctx, izquierda, MARGEN, y0, ancho);
  const altoDer = columnaDatos(ctx, derecha, xDer, y0, ancho);
  ctx.y = y0 + Math.max(altoIzq, altoDer) + 3;
}

// ---- conceptos: cuadrícula completa con encabezados del SAT
const COLS = [19, 21, 14, 15, 24, 18, 22, 21, 28];
const ENCABEZADOS = [
  'Clave del producto y/o servicio', 'No. identificación', 'Cantidad', 'Clave de unidad', 'Unidad',
  'Valor unitario', 'Importe', 'Descuento', 'Objeto impuesto',
];
const ALTO_ETIQUETA = 4.6;

function celda(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string | null) {
  rect(ctx, x, y, w, h, fill, { border: BORDER });
}

function cabeceraConceptos(ctx: Ctx) {
  fuente(ctx, 'PlexSans', 'bold', 5.5, '#FFFFFF');
  const lineas = ENCABEZADOS.map((titulo, i) => envolver(ctx, titulo, COLS[i] - 2));
  const alto = Math.max(7, Math.max(...lineas.map((l) => l.length)) * 2.4 + 2.6);
  let x = MARGEN;
  lineas.forEach((ls, i) => {
    celda(ctx, x, ctx.y, COLS[i], alto, NAVY);
    fuente(ctx, 'PlexSans', 'bold', 5.5, '#FFFFFF');
    ls.forEach((linea, k) => texto(ctx, linea, x + 1, ctx.y + 3.3 + k * 2.4));
    x += COLS[i];
  });
  ctx.y += alto;
}

/** Impuestos que se muestran anidados en la fila de Descripción de cada concepto. */
function impuestosDelConcepto(invoice: Invoice, indice: number): InvoiceImpuesto[] {
  if (invoice.conceptos.some((concepto) => concepto.impuestos && concepto.impuestos.length > 0)) return invoice.conceptos[indice].impuestos ?? [];
  return indice === 0 ? invoice.impuestos : [];
}

/** Misma cuadrícula que las últimas cuatro columnas de conceptos (valor unitario … objeto impuesto). */
const SUB_COLS = [18, 22, 21, 28];
const SUB_TITULOS = ['Impuesto', 'Tipo', 'Base', 'Tasa o cuota'];

function dibujarConcepto(ctx: Ctx, concepto: InvoiceConcepto, impuestos: InvoiceImpuesto[]) {
  // ---- medición
  fuente(ctx, 'PlexSans', 'normal', 6.5, TXT);
  const unidadTexto = concepto.unidad || CLAVE_UNIDAD[concepto.claveUnidad] || '';
  const celdas: Array<{ lineas: string[]; align: 'left' | 'right'; mono: boolean }> = [
    { lineas: [concepto.claveProdServ], align: 'left', mono: true },
    { lineas: [concepto.noIdentificacion ?? ''], align: 'left', mono: true },
    { lineas: [concepto.cantidad], align: 'left', mono: false },
    { lineas: [concepto.claveUnidad], align: 'left', mono: true },
    { lineas: envolver(ctx, unidadTexto, COLS[4] - 2), align: 'left', mono: false },
    { lineas: [formatSat(concepto.valorUnitario)], align: 'left', mono: false },
    { lineas: [formatSat(concepto.importe)], align: 'left', mono: false },
    { lineas: [formatSat(concepto.descuento ?? '')], align: 'left', mono: false },
    { lineas: envolver(ctx, OBJETO_IMP[concepto.objetoImp] ?? concepto.objetoImp, COLS[8] - 2), align: 'left', mono: false },
  ];
  const altoDatos = Math.max(6, Math.max(...celdas.map((c) => c.lineas.length)) * 2.8 + 2.4);
  const anchoSub = SUB_COLS.reduce((a, b) => a + b, 0);
  const anchoDesc = ANCHO - COLS[0] - anchoSub;
  const descripcion = envolver(ctx, concepto.descripcion, anchoDesc - 2);
  const altoDescripcion = Math.max(descripcion.length * 2.8 + 2.4, ALTO_ETIQUETA * (1 + Math.max(impuestos.length, 1)));
  const alto = altoDatos + altoDescripcion + ALTO_ETIQUETA;

  if (asegurarEspacio(ctx, alto)) cabeceraConceptos(ctx);

  // ---- fila de datos
  let x = MARGEN;
  celdas.forEach((c, i) => {
    celda(ctx, x, ctx.y, COLS[i], altoDatos, null);
    if (c.mono) fuente(ctx, 'PlexMono', 'normal', 6.5, TXT);
    else fuente(ctx, 'PlexSans', 'normal', 6.5, TXT);
    c.lineas.forEach((linea, k) => texto(ctx, linea, x + 1, ctx.y + 3.6 + k * 2.8));
    x += COLS[i];
  });
  ctx.y += altoDatos;

  // ---- fila de descripción con impuestos anidados
  celda(ctx, MARGEN, ctx.y, COLS[0], altoDescripcion, PANEL);
  fuente(ctx, 'PlexSans', 'bold', 6, MUTE);
  texto(ctx, 'Descripción', MARGEN + 1, ctx.y + 3.4);
  celda(ctx, MARGEN + COLS[0], ctx.y, anchoDesc, altoDescripcion, null);
  fuente(ctx, 'PlexSans', 'normal', 6.5, TXT);
  descripcion.forEach((linea, k) => texto(ctx, linea, MARGEN + COLS[0] + 1, ctx.y + 3.6 + k * 2.8));

  const xSub = MARGEN + COLS[0] + anchoDesc;
  let xs = xSub;
  SUB_TITULOS.forEach((titulo, i) => {
    celda(ctx, xs, ctx.y, SUB_COLS[i], ALTO_ETIQUETA, PANEL);
    fuente(ctx, 'PlexSans', 'bold', 5.5, MUTE);
    texto(ctx, titulo, xs + 1, ctx.y + 3.1);
    xs += SUB_COLS[i];
  });
  const filas = impuestos.length > 0 ? impuestos : [null];
  filas.forEach((impuesto, r) => {
    const yFila = ctx.y + ALTO_ETIQUETA * (r + 1);
    const valores = impuesto
      ? [conDescripcion(IMPUESTO, impuesto.impuesto), impuesto.tipo, formatSat(impuesto.base), impuesto.tasaOCuota]
      : ['', '', '', ''];
    let xv = xSub;
    valores.forEach((valor, i) => {
      celda(ctx, xv, yFila, SUB_COLS[i], ALTO_ETIQUETA, null);
      if (i === 0 || i === 3) fuente(ctx, 'PlexMono', 'normal', 6.5, TXT);
      else fuente(ctx, 'PlexSans', 'normal', 6.5, TXT);
      texto(ctx, valor, xv + 1, yFila + 3.1);
      xv += SUB_COLS[i];
    });
  });
  // El espacio sobrante bajo la subtabla queda en blanco con el mismo borde de la celda.
  ctx.y += altoDescripcion;

  // ---- pedimento / cuenta predial: la fila existe en el CFDI original aunque vaya vacía
  const wA = COLS[0] + COLS[1];
  const wAVacio = COLS[2] + COLS[3];
  const wB = COLS[4] + COLS[5] + COLS[6];
  const wBVacio = COLS[7] + COLS[8];
  celda(ctx, MARGEN, ctx.y, wA, ALTO_ETIQUETA, PANEL);
  celda(ctx, MARGEN + wA, ctx.y, wAVacio, ALTO_ETIQUETA, null);
  celda(ctx, MARGEN + wA + wAVacio, ctx.y, wB, ALTO_ETIQUETA, PANEL);
  celda(ctx, MARGEN + wA + wAVacio + wB, ctx.y, wBVacio, ALTO_ETIQUETA, null);
  fuente(ctx, 'PlexSans', 'bold', 5.5, MUTE);
  texto(ctx, 'Número de pedimento', MARGEN + 1, ctx.y + 3.1);
  texto(ctx, 'Número de cuenta predial', MARGEN + wA + wAVacio + 1, ctx.y + 3.1);
  ctx.y += ALTO_ETIQUETA;
}

function dibujarConceptos(ctx: Ctx, invoice: Invoice) {
  asegurarEspacio(ctx, 5 + 14 + 30);
  tituloSeccion(ctx, 'CONCEPTOS');
  cabeceraConceptos(ctx);
  invoice.conceptos.forEach((concepto, i) => dibujarConcepto(ctx, concepto, impuestosDelConcepto(invoice, i)));
  ctx.y += 5;
}

function etiquetaImpuesto(impuesto: InvoiceImpuesto): string {
  const nombre = IMPUESTO[impuesto.impuesto] ?? impuesto.impuesto;
  const tasa = impuesto.tasaOCuota && impuesto.tipoFactor !== 'Exento' ? ` ${(Number(impuesto.tasaOCuota) * 100).toFixed(2)}%` : '';
  return `${impuesto.tipo === 'Retención' ? 'Impuestos retenidos' : 'Impuestos trasladados'} ${nombre}${tasa}`;
}

function dibujarPagoYTotales(ctx: Ctx, invoice: Invoice) {
  const anchoTot = 72;
  const xTot = DERECHA - anchoTot;
  const anchoPago = xTot - MARGEN - 6;
  const filasTotales = invoice.impuestos.length > 0
    ? invoice.impuestos.map((impuesto) => ({ rotulo: etiquetaImpuesto(impuesto), valor: formatMoney(impuesto.importe) }))
    : [{ rotulo: 'Impuestos trasladados', valor: formatMoney(invoice.totalImpuestosTrasladados) }];
  const altoFila = 5.4;
  const altoTotales = (1 + filasTotales.length) * altoFila + 9;

  const pago: CeldaDato[] = [
    { rotulo: 'Moneda', valor: invoice.moneda },
    { rotulo: 'Forma de pago', valor: conDescripcion(FORMA_PAGO, invoice.formaPago) },
    { rotulo: 'Método de pago', valor: conDescripcion(METODO_PAGO, invoice.metodoPago) },
    { rotulo: 'Importe con letra', valor: numeroALetras(invoice.total, invoice.moneda) },
  ];
  // Medición previa de la columna izquierda para decidir el salto de página.
  fuente(ctx, 'PlexSans', 'normal', 7.5, TXT);
  const altoPago = pago.reduce((suma, fila) => suma + 3.4 + envolver(ctx, fila.valor || ' ', anchoPago).length * 3.2 + 1.2, 0);
  const alto = Math.max(altoPago, altoTotales);
  asegurarEspacio(ctx, alto + 5);

  const y0 = ctx.y;
  columnaDatos(ctx, pago, MARGEN, y0 + 2, anchoPago);

  let yt = y0;
  const renglones: Array<[string, string]> = [['Subtotal', formatMoney(invoice.subtotal)], ...filasTotales.map((f): [string, string] => [f.rotulo, f.valor])];
  for (const [rotulo, valor] of renglones) {
    fuente(ctx, 'PlexSans', 'normal', 7, TXT);
    texto(ctx, rotulo, xTot, yt + 3.8);
    texto(ctx, valor, DERECHA, yt + 3.8, { align: 'right' });
    ctx.doc.setDrawColor(BORDER).setLineWidth(0.2).line(xTot, yt + altoFila, DERECHA, yt + altoFila);
    yt += altoFila;
  }
  rect(ctx, xTot, yt + 1, anchoTot, 9, NAVY, { radius: 1.5 });
  fuente(ctx, 'PlexSans', 'bold', 7, '#FFFFFF');
  texto(ctx, 'TOTAL', xTot + 3, yt + 6.8);
  fuente(ctx, 'PlexSans', 'bold', 11, TOTAL_ORANGE);
  texto(ctx, `$${formatMoney(invoice.total)}`, DERECHA - 3, yt + 7.2, { align: 'right' });

  ctx.y = y0 + alto + 6;
}

/**
 * Sello o cadena original, completos y en courier 5pt. Se dibuja por tramos de renglones
 * enteros y solo se parte entre páginas; cada iteración consume al menos un renglón, así
 * que nunca se cuelga. El primer tramo puede ser más angosto (junto al QR).
 */
function dibujarSello(ctx: Ctx, rotulo: string, valor: string, primero: { x: number; ancho: number } = { x: MARGEN, ancho: ANCHO }) {
  const { doc } = ctx;
  const CABECERA = 6.5;
  const MIN_RENGLONES = 3;
  let indice = 0;
  let continua = false;
  let { x, ancho } = primero;
  while (indice < valor.length) {
    fuente(ctx, 'courier', 'normal', 5, MUTE);
    const porLinea = Math.max(1, Math.floor((ancho - 6) / doc.getTextWidth('M') - 0.01));
    const restantes = Math.ceil((valor.length - indice) / porLinea);
    const caben = Math.floor((LIMITE_Y - ctx.y - CABECERA - 3) / INTERLINEA);
    if (caben < Math.min(MIN_RENGLONES, restantes) && ctx.y > Y_INICIO) {
      nuevaPagina(ctx);
      ({ x, ancho } = { x: MARGEN, ancho: ANCHO });
      continue;
    }
    const n = Math.max(1, Math.min(caben, restantes));
    const alto = CABECERA + n * INTERLINEA + 3;
    fuente(ctx, 'PlexSans', 'bold', 6.5, NAVY);
    texto(ctx, continua ? `${rotulo} (continúa)` : rotulo, x, ctx.y + 2.5);
    rect(ctx, x, ctx.y + 4, ancho, alto - 4, SEAL_BG, { border: BORDER, radius: 1 });
    fuente(ctx, 'courier', 'normal', 5, TXT);
    for (let k = 0; k < n; k++) texto(ctx, valor.slice(indice + k * porLinea, indice + (k + 1) * porLinea), x + 3, ctx.y + CABECERA + 1.2 + k * INTERLINEA);
    indice += Math.min(n * porLinea, valor.length - indice);
    ctx.y += alto;
    if (indice < valor.length) {
      nuevaPagina(ctx);
      ({ x, ancho } = { x: MARGEN, ancho: ANCHO });
      continua = true;
    }
  }
  ctx.y += 3;
}

async function dibujarQrYCadena(ctx: Ctx, invoice: Invoice) {
  const TAM = 26;
  asegurarEspacio(ctx, TAM + 10);
  const y0 = ctx.y;
  const pagina0 = ctx.doc.getCurrentPageInfo().pageNumber;
  const url = invoice.urlQrOriginal ?? urlVerificacionSat({
    uuid: invoice.uuid, rfcEmisor: invoice.emisor.rfc, rfcReceptor: invoice.receptor.rfc, total: invoice.total, selloCFD: invoice.timbre.selloCFD,
  });
  // 400 px para que impreso mida ≥ 2.75 cm (la norma del SAT); aquí se imprime a 26 mm con margen de silencio.
  const qr = await QRCode.toDataURL(url, { width: 400, margin: 1, errorCorrectionLevel: 'M' });
  rect(ctx, MARGEN, y0, TAM, TAM, '#FFFFFF', { border: BORDER, radius: 1 });
  ctx.doc.addImage(qr, 'PNG', MARGEN + 0.5, y0 + 0.5, TAM - 1, TAM - 1);

  const x = MARGEN + TAM + 4;
  dibujarSello(ctx, 'Cadena original del complemento de certificación digital del SAT', invoice.timbre.cadenaOriginal, { x, ancho: DERECHA - x });
  if (ctx.doc.getCurrentPageInfo().pageNumber === pagina0) ctx.y = Math.max(ctx.y, y0 + TAM + 3);

  asegurarEspacio(ctx, 14);
  const filas: CeldaDato[] = [
    { rotulo: 'RFC del proveedor de certificación', valor: invoice.timbre.rfcProvCertif, mono: true },
    { rotulo: 'Fecha y hora de certificación', valor: formatFechaHora(invoice.timbre.fechaCertificacion), mono: true },
    { rotulo: 'No. de serie del certificado SAT', valor: invoice.timbre.noCertificadoSAT, mono: true },
  ];
  const ancho = (ANCHO - 8) / 3;
  const y1 = ctx.y;
  filas.forEach((fila, i) => columnaDatos(ctx, [fila], MARGEN + i * (ancho + 4), y1, ancho));
  ctx.y = y1 + 10;
}

function dibujarPies(ctx: Ctx) {
  const total = ctx.doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    ctx.doc.setPage(i);
    ctx.doc.setDrawColor(BORDER).setLineWidth(0.2).line(MARGEN, 286, DERECHA, 286);
    fuente(ctx, 'PlexSans', 'normal', 6.5, MUTE);
    texto(ctx, 'Este documento es una representación impresa de un CFDI', 105, 290, { align: 'center' });
    texto(ctx, `Página ${i} de ${total}`, DERECHA, 290, { align: 'right' });
    bandaInferior(ctx);
  }
}

// ---------------------------------------------------------------- API
export async function generarFacturaPdf(invoice: Invoice): Promise<InvoicePdfResult> {
  const assets = await loadAssets();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.addFileToVFS('IBMPlexSans-Regular.ttf', assets.sans);
  doc.addFont('IBMPlexSans-Regular.ttf', 'PlexSans', 'normal');
  doc.addFileToVFS('IBMPlexSans-Bold.ttf', assets.sansBold);
  doc.addFont('IBMPlexSans-Bold.ttf', 'PlexSans', 'bold');
  doc.addFileToVFS('IBMPlexMono-Regular.ttf', assets.mono);
  doc.addFont('IBMPlexMono-Regular.ttf', 'PlexMono', 'normal');
  doc.addFileToVFS('IBMPlexMono-SemiBold.ttf', assets.monoBold);
  doc.addFont('IBMPlexMono-SemiBold.ttf', 'PlexMono', 'bold');
  const nombre = `${nombreArchivoFactura(invoice.folio)}.pdf`;
  doc.setProperties({ title: nombre, subject: 'Representación impresa de un CFDI 4.0', author: 'JC Motors' });

  const ctx: Ctx = { doc, y: 0, trace: [] };
  bandaSuperior(ctx);
  dibujarEncabezado(ctx, invoice, assets.logo);
  dibujarRejilla(ctx, invoice);
  dibujarConceptos(ctx, invoice);
  dibujarPagoYTotales(ctx, invoice);
  dibujarSello(ctx, 'Sello digital del CFDI', invoice.timbre.selloCFD);
  dibujarSello(ctx, 'Sello digital del SAT', invoice.timbre.selloSAT);
  await dibujarQrYCadena(ctx, invoice);
  dibujarPies(ctx);

  const file = new File([doc.output('blob')], nombre, { type: 'application/pdf' });
  return { file, pages: doc.getNumberOfPages(), trace: ctx.trace, nombre };
}
