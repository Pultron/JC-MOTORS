import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import jsQR from 'jsqr';
import type { CampoDudoso, InvoiceBorrador, InvoiceConcepto, InvoiceImpuesto } from '../models/invoice';
import { bufferToBase64 } from '../utils/base64';
import {
  CLAVE_UNIDAD, EXPORTACION, FORMA_PAGO, METODO_PAGO, MONEDA, OBJETO_IMP, REGIMEN_FISCAL, TIPO_COMPROBANTE, USO_CFDI,
} from './satCatalogs';
import { CAMPOS_DE_INTEGRIDAD, sinDuplicados, validarIntegridad } from './invoiceValidation';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;

export async function abrirPdf(bytes: Uint8Array): Promise<PdfDocument> {
  // pdf.js transfiere (y deja vacío) el buffer que recibe: se le pasa una copia.
  return pdfjs.getDocument({ data: bytes.slice() }).promise;
}

/** XML incrustado por el PAC dentro del PDF, si existe. */
export async function buscarXmlAdjunto(pdf: PdfDocument): Promise<string | null> {
  const adjuntos = await pdf.getAttachments();
  if (!adjuntos) return null;
  for (const [id, adjunto] of adjuntos) {
    if (!/\.xml$/i.test(adjunto.filename)) continue;
    // pdf.js 5+ entrega el contenido aparte, con getAttachmentContent.
    const contenido = await pdf.getAttachmentContent(id) as unknown;
    const bytes = contenido instanceof Uint8Array ? contenido : (contenido as { content?: Uint8Array } | null)?.content;
    if (bytes) return new TextDecoder('utf-8').decode(bytes);
  }
  return null;
}

// ------------------------------------------------------------------ texto
interface Item { str: string; x: number; y: number; w: number }
export interface Linea { items: Item[]; texto: string; x: number; y: number }

const TOLERANCIA_Y = 2;

/** Reconstruye renglones en orden de lectura: y descendente, x ascendente, agrupando con ±2 unidades. */
export async function leerLineas(pdf: PdfDocument): Promise<Linea[]> {
  const lineas: Linea[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const contenido = await (await pdf.getPage(n)).getTextContent();
    const items: Item[] = contenido.items
      .filter((item): item is typeof item & { str: string; transform: number[]; width: number } => 'str' in item && item.str.trim() !== '')
      .map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width ?? 0 }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let actual: Item[] = [];
    let yActual = Number.NaN;
    const cerrar = () => {
      if (actual.length === 0) return;
      const ordenados = [...actual].sort((a, b) => a.x - b.x);
      lineas.push({ items: ordenados, texto: ordenados.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim(), x: ordenados[0].x, y: ordenados[0].y });
      actual = [];
    };
    for (const item of items) {
      if (actual.length > 0 && Math.abs(item.y - yActual) > TOLERANCIA_Y) cerrar();
      if (actual.length === 0) yActual = item.y;
      actual.push(item);
    }
    cerrar();
  }
  return lineas;
}

// ------------------------------------------------------------------ QR
export interface DatosQr { url: string; id: string; re: string; rr: string; tt: string; fe: string }

function decodificarQr(canvas: HTMLCanvasElement): string | null {
  const contexto = canvas.getContext('2d');
  if (!contexto) return null;
  const imagen = contexto.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(imagen.data, imagen.width, imagen.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/** Renderiza cada página (de la última a la primera: el QR suele ir al final) y busca el QR del SAT. */
export async function leerQr(pdf: PdfDocument): Promise<DatosQr | null> {
  for (const escala of [2, 3.5]) {
    for (let n = pdf.numPages; n >= 1; n--) {
      const pagina = await pdf.getPage(n);
      const viewport = pagina.getViewport({ scale: escala });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const contexto = canvas.getContext('2d', { willReadFrequently: true });
      if (!contexto) continue;
      contexto.fillStyle = '#fff';
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvas, canvasContext: contexto, viewport }).promise;
      const url = decodificarQr(canvas);
      if (!url || !/verificacfdi|facturaelectronica\.sat/i.test(url)) continue;
      try {
        const params = new URL(url).searchParams;
        return {
          url, id: (params.get('id') ?? '').toUpperCase(), re: params.get('re') ?? '', rr: params.get('rr') ?? '',
          tt: params.get('tt') ?? '', fe: params.get('fe') ?? '',
        };
      } catch { /* QR que no es una URL: se sigue buscando */ }
    }
  }
  return null;
}

// ------------------------------------------------------------------ extracción por anclas
const RE = {
  uuid: /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i,
  rfc: /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g,
  fecha: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g,
  importe: /(?<![\d.])\d{1,3}(?:,\d{3})*\.\d{2,6}(?![\d])|(?<![\d.])\d+\.\d{2,6}(?![\d])/g,
  serie20: /\b\d{20}\b/g,
  claveSAT: /^\d{8}\b/,
};

const ANCLAS = {
  uuid: ['Folio fiscal', 'FOLIO FISCAL (UUID)', 'UUID'],
  selloCFD: ['Sello digital del CFDI', 'SELLO DIGITAL DEL CFDI'],
  selloSAT: ['Sello digital del SAT', 'SELLO DIGITAL DEL SAT'],
  cadena: ['Cadena Original del complemento de certificación digital del SAT', 'Cadena Original del complemento', 'CADENA ORIGINAL'],
  rfcProvCertif: ['RFC del proveedor de certificación', 'RFC PROVEEDOR DE CERTIFICACIÓN'],
  fechaCertif: ['Fecha y hora de certificación', 'FECHA Y HORA DE CERTIFICACIÓN'],
  noCertifSAT: ['No. de serie del certificado SAT', 'NO. DE SERIE DEL CERTIFICADO DEL SAT'],
  serieCSD: ['No. de serie del CSD', 'NO. DE SERIE DEL CERTIFICADO DEL EMISOR'],
} as const;

/** Minúsculas y sin acentos, carácter por carácter (conserva los índices del texto original). */
const plano = (texto: string) => texto.replace(/[áàä]/gi, 'a').replace(/[éèë]/gi, 'e').replace(/[íìï]/gi, 'i').replace(/[óòö]/gi, 'o').replace(/[úùü]/gi, 'u').replace(/ñ/gi, 'n').toLowerCase();

const compacto = (texto: string) => plano(texto).replace(/\s+/g, '');

const sinComas = (valor: string) => valor.replace(/,/g, '');
const normalizarFecha = (fecha: string) => fecha.replace(' ', 'T');

function buscarLinea(lineas: Linea[], alias: readonly string[], desde = 0): number {
  const claves = alias.map(compacto);
  for (let i = desde; i < lineas.length; i++) {
    const texto = compacto(lineas[i].texto);
    if (claves.some((clave) => texto.includes(clave))) return i;
  }
  return -1;
}

const normalizarEtiqueta = (texto: string) => plano(texto).replace(/\s+/g, ' ').replace(/[\s:]+$/, '').trim();

const ETIQUETAS_CONOCIDAS = new Set([
  ...Object.values(ANCLAS).flat(),
  'RFC emisor', 'RFC del emisor', 'Nombre emisor', 'Nombre del emisor', 'RFC receptor', 'RFC del receptor', 'Nombre receptor', 'Nombre del receptor',
  'Código postal del receptor', 'Régimen fiscal receptor', 'Régimen fiscal del receptor', 'Uso CFDI', 'Uso del CFDI',
  'Código postal, fecha y hora de emisión', 'Efecto de comprobante', 'Tipo de comprobante', 'Régimen fiscal', 'Exportación',
  'Lugar de expedición', 'Fecha de emisión', 'Fecha y hora de emisión', 'Versión', 'Moneda', 'Forma de pago', 'Método de pago',
  'Importe con letra', 'Subtotal', 'Total', 'Impuestos trasladados', 'Impuestos retenidos', 'Condiciones de pago',
].map(normalizarEtiqueta));

const terminaEnDosPuntos = (texto: string) => /:\s*$/.test(texto);

/** ¿Este fragmento es (parte de) una etiqueta y no un valor? Termina en ":" o es una etiqueta conocida / su comienzo. */
function esEtiquetaItem(texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  if (terminaEnDosPuntos(t)) return true;
  const n = normalizarEtiqueta(t);
  if (n.length < 4) return false;
  for (const conocida of ETIQUETAS_CONOCIDAS) if (conocida === n || conocida.startsWith(`${n} `)) return true;
  return false;
}

/**
 * Valor de un par "Etiqueta: valor" en el mismo renglón (diseño en dos columnas del SAT). La etiqueta puede
 * partirse en dos renglones ("Código postal del" / "receptor:") y el valor termina donde empieza la siguiente
 * etiqueta, así que nunca absorbe la columna de al lado. Devuelve null si el valor no está a la derecha.
 */
function valorEnRenglon(lineas: Linea[], alias: readonly string[]): string | null {
  const objetivos = new Set(alias.map(normalizarEtiqueta));
  const valorDesde = (items: Item[], desde: number): string => {
    const partes: string[] = [];
    for (const item of items.slice(desde)) {
      if (esEtiquetaItem(item.str)) break;
      partes.push(item.str.trim());
    }
    return partes.join(' ').replace(/\s+/g, ' ').trim();
  };
  for (let i = 0; i < lineas.length; i++) {
    const { items } = lineas[i];
    for (let k = 0; k < items.length; k++) {
      // Etiqueta y valor en un solo fragmento: "USO CFDI: G03 - Gastos en general."
      const enUno = items[k].str.match(/^\s*([^:|]{3,60}?)\s*:\s+(\S.*)$/);
      if (enUno && objetivos.has(normalizarEtiqueta(enUno[1]))) return enUno[2].trim();
      if (!esEtiquetaItem(items[k].str)) continue;
      let etiqueta = items[k].str;
      let continuacion: { linea: number; indice: number } | null = null;
      if (!terminaEnDosPuntos(etiqueta) && lineas[i + 1]) {
        const indice = lineas[i + 1].items.findIndex((it) => Math.abs(it.x - items[k].x) <= 3 && terminaEnDosPuntos(it.str));
        if (indice >= 0) { continuacion = { linea: i + 1, indice }; etiqueta = `${etiqueta} ${lineas[i + 1].items[indice].str}`; }
      }
      if (!objetivos.has(normalizarEtiqueta(etiqueta))) continue;
      let valor = valorDesde(items, k + 1);
      if (!valor && continuacion) valor = valorDesde(lineas[continuacion.linea].items, continuacion.indice + 1);
      if (valor) return valor.replace(/^[\s:]+/, '');
    }
  }
  return null;
}

/**
 * Valor que va DEBAJO de su etiqueta (diseño de etiqueta arriba / valor abajo), aunque el valor esté centrado o
 * alineado a la derecha: se toma el texto más cercano hacia abajo cuyo tramo horizontal se traslapa con el de la
 * etiqueta, de modo que los renglones de otra columna intercalados no lo contaminan.
 */
function valorDebajoDeEtiqueta(lineas: Linea[], alias: readonly string[], exacto: boolean): string | null {
  const objetivos = alias.map(normalizarEtiqueta);
  for (let i = 0; i < lineas.length; i++) {
    for (const etiqueta of lineas[i].items) {
      const texto = normalizarEtiqueta(etiqueta.str);
      if (!objetivos.some((objetivo) => (exacto ? texto === objetivo : texto === objetivo || texto.startsWith(`${objetivo} `)))) continue;
      for (let j = i + 1; j < lineas.length && etiqueta.y - lineas[j].y <= 18; j++) {
        const debajo = lineas[j].items.filter((item) => item.x < etiqueta.x + etiqueta.w + 20 && item.x + item.w > etiqueta.x - 20 && !esEtiquetaItem(item.str));
        if (debajo.length > 0) return debajo.map((item) => item.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
      }
    }
  }
  return null;
}

const INICIOS_DE_ETIQUETA = /^(rfc|nombre|c[oó]digo postal|r[eé]gimen|uso cfdi|folio|no\. de serie|efecto|exportaci|moneda|forma de pago|m[eé]todo de pago|importe con letra|fecha|lugar|subtotal|total|impuestos?)/i;

/**
 * Texto que sigue a la etiqueta: en su mismo item, debajo de ella (misma columna), a su derecha
 * o, como último recurso, en el renglón siguiente. `exacto` evita que "Régimen fiscal" tome
 * también "Régimen fiscal receptor".
 */
function valorTrasEtiqueta(lineas: Linea[], alias: readonly string[], desde = 0, exacto = false): { valor: string; indice: number } | null {
  const claves = alias.map(plano);
  for (let i = desde; i < lineas.length; i++) {
    const { items } = lineas[i];
    for (let k = 0; k < items.length; k++) {
      const p = plano(items[k].str).trim();
      const clave = claves.find((c) => (exacto ? p.replace(/[:\s]+$/, '') === c : p.includes(c)));
      if (!clave) continue;
      const resto = exacto ? '' : items[k].str.slice(plano(items[k].str).indexOf(clave) + clave.length).replace(/^[\s:.\-–]+/, '').trim();
      if (resto) return { valor: resto, indice: i };
      const xFin = items[k + 1]?.x ?? Number.POSITIVE_INFINITY;
      // La columna puede quedar intercalada con renglones de otra columna: se revisan hasta 3 renglones.
      let debajo = '';
      for (let j = i + 1; j <= i + 3 && j < lineas.length && !debajo; j++) {
        const alineado = lineas[j].items.findIndex((it) => Math.abs(it.x - items[k].x) <= 4);
        if (alineado < 0) continue;
        debajo = lineas[j].items.slice(alineado).filter((it, n) => n === 0 || it.x < xFin - 1).map((it) => it.str.trim()).join(' ').trim();
      }
      if (debajo && !INICIOS_DE_ETIQUETA.test(debajo)) return { valor: debajo, indice: i + 1 };
      const siguiente = items.slice(k + 1).findIndex((it) => esEtiquetaItem(it.str));
      const aLaDerecha = items.slice(k + 1, siguiente < 0 ? undefined : k + 1 + siguiente).map((it) => it.str.trim()).join(' ').trim();
      if (aLaDerecha) return { valor: aLaDerecha, indice: i };
      if (lineas[i + 1]) return { valor: lineas[i + 1].texto, indice: i + 1 };
    }
  }
  // Respaldo: etiqueta partida en varios items de un mismo renglón.
  const indice = buscarLinea(lineas, alias, desde);
  if (indice < 0) return null;
  const texto = lineas[indice].texto;
  const textoPlano = plano(texto);
  let resto = '';
  for (const clave of claves) {
    const posicion = textoPlano.indexOf(clave);
    if (posicion >= 0) { resto = texto.slice(posicion + clave.length).replace(/^[\s:.\-–]+/, '').trim(); break; }
  }
  if (!resto && lineas[indice + 1]) resto = lineas[indice + 1].texto;
  return { valor: resto, indice };
}

function porDescripcion(catalogo: Record<string, string>, texto: string): string | undefined {
  const objetivo = plano(texto);
  return Object.entries(catalogo).find(([, descripcion]) => objetivo.includes(plano(descripcion)))?.[0];
}

interface Extraccion { invoice: InvoiceBorrador; dudas: CampoDudoso[] }

const ETIQUETAS_NO_NOMBRE = /^(facturar a|datos del|rfc|c[oó]digo postal|r[eé]gimen|uso cfdi|folio|emisor|receptor|cliente|jc motors|taller automotriz)/i;

/** Nombre asociado a un RFC: a su derecha en el mismo renglón o, si no, el texto más cercano arriba o abajo en su misma columna. */
function nombreCercaDe(lineas: Linea[], rfc: string): string {
  if (!rfc) return '';
  const indice = lineas.findIndex((linea) => linea.items.some((item) => item.str.includes(rfc)));
  if (indice < 0) return '';
  const item = lineas[indice].items.find((it) => it.str.includes(rfc)) as Item;
  const limpiar = (texto: string) => texto
    .replace(rfc, '')
    .replace(/\b(RFC|Nombre|Raz[oó]n social|Emisor|Receptor|Cliente|Facturar a)\b\s*(o raz[oó]n social)?\s*:?/gi, '')
    .replace(/\s+/g, ' ').trim();
  const esNombre = (texto: string) => {
    const limpio = limpiar(texto);
    return limpio.length >= 3 && /[A-Za-zÁÉÍÓÚÑ]{3}/.test(limpio) && !/\d{4}/.test(limpio) && !esEtiquetaItem(texto) && !ETIQUETAS_NO_NOMBRE.test(texto.trim());
  };

  if (esNombre(item.str)) return limpiar(item.str);
  for (const siguiente of lineas[indice].items.filter((it) => it.x > item.x)) {
    if (esEtiquetaItem(siguiente.str) && !/^\s*(nombre|raz[oó]n social)/i.test(siguiente.str)) break;
    if (esNombre(siguiente.str)) return limpiar(siguiente.str);
  }

  const centro = item.x + item.w / 2;
  const enColumna = (it: Item) => esNombre(it.str) && Math.abs(it.x + it.w / 2 - centro) <= 100;
  const vecinas = [
    ...lineas.slice(Math.max(0, indice - 4), indice).reverse().filter((l) => l.y - item.y <= 28),
    ...lineas.slice(indice + 1, indice + 3).filter((l) => item.y - l.y <= 18),
  ];
  for (const linea of vecinas) {
    const candidato = linea.items.filter(enColumna).sort((a, b) => Math.abs(a.x + a.w / 2 - centro) - Math.abs(b.x + b.w / 2 - centro))[0];
    if (candidato) return limpiar(candidato.str);
  }
  return '';
}

/** Contenido entre una etiqueta y la siguiente etiqueta conocida (sellos y cadena, partidos en varios renglones). */
function seccionesDeTexto(lineas: Linea[], alias: readonly string[], terminadores: readonly string[]): string {
  const limpias = lineas.filter((linea) => !/^p[aá]gina\s+\d+\s+de\s+\d+/i.test(linea.texto) && !/representaci[oó]n impresa de un cfdi/i.test(linea.texto));
  const inicios = alias.map(plano);
  const fines = terminadores.map(compacto);
  let acumulado = '';
  for (let i = 0; i < limpias.length; i++) {
    const textoPlano = plano(limpias[i].texto);
    const clave = inicios.find((c) => textoPlano.includes(c));
    if (!clave) continue;
    // Lo que queda de la etiqueta (":" o un "de certificación digital del SAT:" más largo) no es contenido.
    const resto = limpias[i].texto.slice(textoPlano.indexOf(clave) + clave.length);
    acumulado += limpias[i].texto.length < 90 && /:\s*$/.test(resto) ? '' : resto.replace(/\(contin[uú]a\)/i, '').replace(/^[\s:.\-–]+/, '');
    for (let j = i + 1; j < limpias.length; j++) {
      const siguiente = compacto(limpias[j].texto);
      // Las líneas de sello o cadena son largas: solo una línea corta puede ser la etiqueta que cierra la sección.
      if (limpias[j].texto.length < 90 && fines.some((fin) => siguiente.includes(fin))) break;
      acumulado += limpias[j].texto;
      i = j;
    }
  }
  return acumulado.replace(/\s+/g, '');
}

const FINES_DE_SECCION = [
  ...ANCLAS.selloCFD, ...ANCLAS.selloSAT, ...ANCLAS.cadena,
  'Verificación SAT', 'Este documento es una representación', 'Certificación', 'Importe con letra', 'Condiciones de pago',
];

/** Importes que aparecen a la derecha de una etiqueta (o dentro de ella) en su mismo renglón. */
function importesDespuesDe(lineas: Linea[], alias: readonly string[], excluir?: RegExp): string[] | null {
  const claves = alias.map(plano);
  for (const linea of lineas) {
    const k = linea.items.findIndex((item) => {
      const p = plano(item.str).trim();
      return claves.some((clave) => p.startsWith(clave)) && !(excluir && excluir.test(p));
    });
    if (k < 0) continue;
    const resto = linea.items.slice(k).map((item) => item.str).join(' ');
    const valores = [...resto.matchAll(RE.importe)].map((m) => sinComas(m[0]));
    if (valores.length > 0) return valores;
  }
  return null;
}

// ---- conceptos: columnas ubicadas por el centro (x + ancho/2) de sus encabezados.
// Las celdas no siempre están alineadas a la izquierda del encabezado (suelen ir centradas), así que
// cada texto se asigna a la columna que contiene su centro.
const COLUMNAS_CONCEPTO = [
  ['claveProdServ', /^clave (del|sat|prod)/i],
  ['noIdentificacion', /^no\.?\s*(de\s*)?identific/i],
  ['cantidad', /^cantidad/i],
  ['claveUnidad', /^clave (de(?!l)|unidad)/i],
  ['unidad', /^unidad$/i],
  ['valorUnitario', /^(valor|v\.|precio)\s*unitario|^valor$/i],
  ['importe', /^importe$/i],
  ['descuento', /^descuento/i],
  ['objetoImp', /^objeto/i],
  // Solo existe como columna en el diseño de una fila por concepto; en el del SAT "Descripción" es una etiqueta de fila.
  ['descripcion', /^descripci[oó]n$/i],
] as const;
type ColumnaConcepto = typeof COLUMNAS_CONCEPTO[number][0];

interface FilaImpuestoLeida { impuesto: string; tipo: 'Traslado' | 'Retención'; base: string; tasaOCuota: string }
interface ConceptosLeidos { conceptos: InvoiceConcepto[]; filasImpuesto: FilaImpuestoLeida[] }

const CODIGO_IMPUESTO: Record<string, string> = { isr: '001', iva: '002', ieps: '003' };
const NUMERO = /^\$?\s*\d[\d,]*\.\d+$/;

/** "002 · IVA", "IVA" … + Traslado + base + tasa ("16.00%" o "0.160000") + importe. Null si el renglón no es un impuesto. */
function leerFilaImpuesto(fila: string[]): FilaImpuestoLeida | null {
  const cabeza = fila[0] ?? '';
  const impuesto = cabeza.match(/^(00[123])\b/)?.[1] ?? CODIGO_IMPUESTO[plano(cabeza).trim().match(/^(iva|isr|ieps)\b/)?.[1] ?? ''];
  if (!impuesto) return null;
  const resto = fila.slice(1).map((texto) => texto.trim());
  const porcentaje = resto.find((texto) => /^\d+(\.\d+)?\s*%$/.test(texto));
  const numeros = resto.filter((texto) => NUMERO.test(texto));
  const fraccion = numeros.find((texto) => /^0\.\d{3,6}$/.test(texto));
  const tasaOCuota = porcentaje ? (parseFloat(porcentaje) / 100).toFixed(6) : fraccion ?? '';
  const base = numeros.find((texto) => texto !== fraccion);
  if (!base) return null;
  return { impuesto, tipo: resto.some((texto) => /retenci/i.test(texto)) ? 'Retención' : 'Traslado', base: sinComas(base).replace(/^\$\s*/, ''), tasaOCuota };
}

/** "002 IVA Base - 550 Tasa - 0.160000 Importe - $ 88.00": impuesto de un concepto escrito como texto corrido. */
function leerImpuestoEnTexto(texto: string, tipo: 'Traslado' | 'Retención'): FilaImpuestoLeida | null {
  const encontrado = texto.match(/^(00[123]|iva|isr|ieps)\b.*?\bbase\s*[-:]\s*\$?\s*([\d,]+(?:\.\d+)?).*?\btasa(?:\s+o\s+cuota)?\s*[-:]\s*([\d.]+\s*%?)/i);
  if (!encontrado) return null;
  const impuesto = /^00[123]$/.test(encontrado[1]) ? encontrado[1] : CODIGO_IMPUESTO[encontrado[1].toLowerCase()];
  const tasa = encontrado[3].trim();
  return { impuesto, tipo, base: sinComas(encontrado[2]), tasaOCuota: tasa.endsWith('%') ? (parseFloat(tasa) / 100).toFixed(6) : tasa };
}

const FIN_DE_CONCEPTO =/^(n[uú]mero de pedimento|subtotal|moneda|forma de pago|m[eé]todo de pago|importe con letra)/i;

function extraerConceptos(lineas: Linea[], dudas: CampoDudoso[]): ConceptosLeidos {
  const vacio = (): ConceptosLeidos => {
    dudas.push({ campo: 'conceptos.0.descripcion', motivo: 'No se pudieron identificar los conceptos en el PDF' });
    return { conceptos: [{ claveProdServ: '', noIdentificacion: '', cantidad: '', claveUnidad: '', unidad: '', descripcion: '', valorUnitario: '', importe: '', descuento: '', objetoImp: '' }], filasImpuesto: [] };
  };
  // El encabezado puede quedar partido en renglones con y ligeramente distinta ("Clave del producto" / "y/o servicio").
  const ancla = lineas.findIndex((linea) => linea.items.some((item) => /^cantidad/i.test(item.str.trim())) && linea.items.some((item) => /^(importe|valor)/i.test(item.str.trim())));
  if (ancla < 0) return vacio();
  let primero = ancla;
  let ultimo = ancla;
  while (primero > 0 && Math.abs(lineas[primero - 1].y - lineas[ancla].y) <= 6) primero--;
  while (ultimo + 1 < lineas.length && Math.abs(lineas[ultimo + 1].y - lineas[ancla].y) <= 6) ultimo++;
  const encabezado = lineas.slice(primero, ultimo + 1).flatMap((linea) => linea.items);

  // Cada columna abarca desde el borde izquierdo de su encabezado hasta el del siguiente; una celda pertenece a
  // la columna que contiene su centro. Así funcionan celdas alineadas a la izquierda, centradas o a la derecha.
  const centros: Array<[ColumnaConcepto, number]> = [];
  for (const [nombre, patron] of COLUMNAS_CONCEPTO) {
    const item = encabezado.find((it) => patron.test(it.str.trim()));
    if (item) centros.push([nombre, item.x]);
  }
  centros.sort((a, b) => a[1] - b[1]);
  if (centros.length < 4) return vacio();
  // Una descripción larga se extiende a lo ancho de su columna: si empieza dentro de ella, es descripción.
  const itemsEncabezado = COLUMNAS_CONCEPTO.map(([, patron]) => encabezado.find((it) => patron.test(it.str.trim())));
  const xDescripcion = itemsEncabezado[9]?.x;
  const xTrasDescripcion = xDescripcion === undefined ? Number.POSITIVE_INFINITY : Math.min(...encabezado.filter((it) => it.x > xDescripcion + 5).map((it) => it.x), Number.POSITIVE_INFINITY);
  const columnaDe = (item: Item): ColumnaConcepto => {
    if (xDescripcion !== undefined && item.x >= xDescripcion - 3 && item.x < xTrasDescripcion - 3) return 'descripcion';
    const centro = item.x + item.w / 2;
    return ([...centros].reverse().find(([, izquierda]) => izquierda - 3 <= centro) ?? centros[0])[0];
  };
  const xValorUnitario = itemsEncabezado[5]?.x ?? Number.POSITIVE_INFINITY;
  const unRenglonPorConcepto = xDescripcion !== undefined;

  const conceptos: InvoiceConcepto[] = [];
  const filasImpuesto: FilaImpuestoLeida[] = [];
  // Diseño del SAT: el concepto empieza con su clave de 8 dígitos. Diseño de una fila: empieza con la cantidad.
  const esInicio = (linea?: Linea) => {
    const primero = linea?.items[0];
    if (!primero) return false;
    return unRenglonPorConcepto ? /^\d+(\.\d+)?$/.test(primero.str.trim()) && columnaDe(primero) === 'cantidad' : /^\d{8}$/.test(primero.str.trim());
  };

  let i = ultimo + 1;
  while (i < lineas.length && !esInicio(lineas[i])) i++;
  while (i < lineas.length && esInicio(lineas[i])) {
    const inicio = i;
    let fin = i + 1;
    while (fin < lineas.length && !esInicio(lineas[fin]) && !FIN_DE_CONCEPTO.test(lineas[fin].items[0]?.str.trim() ?? '')) fin++;

    const celdas = new Map<ColumnaConcepto, string[]>();
    for (const item of lineas[inicio].items) {
      const columna = columnaDe(item);
      celdas.set(columna, [...(celdas.get(columna) ?? []), item.str.trim()]);
    }

    const bloque = lineas.slice(inicio + 1, fin);
    const descripcion: string[] = [];
    let claveDelTexto = '';
    if (unRenglonPorConcepto) {
      // Una fila por concepto: la descripción sigue en su columna hasta "Clave Prod. Serv. - …" o "Impuestos:",
      // y los impuestos vienen como texto ("002 IVA Base - 550 Tasa - 0.160000 Importe - $ 88.00").
      let enDescripcion = true;
      let tipo: 'Traslado' | 'Retención' = 'Traslado';
      for (const linea of bloque) {
        const textoLinea = linea.items.map((item) => item.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
        const clave = textoLinea.match(/clave\s+prod\.?\s*serv\.?\s*[-:]?\s*(\d{8})/i)?.[1];
        if (clave) { claveDelTexto = clave; enDescripcion = false; continue; }
        if (/^impuestos\s*:?$/i.test(textoLinea)) { enDescripcion = false; continue; }
        if (/^(traslados?|retenciones?)\s*:?$/i.test(textoLinea)) { tipo = /^retenc/i.test(textoLinea) ? 'Retención' : 'Traslado'; enDescripcion = false; continue; }
        const impuesto = leerImpuestoEnTexto(textoLinea, tipo);
        if (impuesto) { filasImpuesto.push(impuesto); enDescripcion = false; continue; }
        if (enDescripcion) descripcion.push(...linea.items.filter((item) => columnaDe(item) === 'descripcion').map((item) => item.str.trim()));
      }
      descripcion.unshift(...(celdas.get('descripcion') ?? []));
    } else {
      // Diseño del SAT: la subtabla de impuestos arranca en su propio encabezado ("Impuesto"); a la izquierda va la descripción.
      const xImpuestos = bloque.flatMap((linea) => linea.items).find((item) => /^impuesto$/i.test(item.str.trim()))?.x ?? xValorUnitario - 6;
      let enDescripcion = false;
      for (const linea of bloque) {
        if (linea.items.some((item) => /^descripci[oó]n$/i.test(item.str.trim()))) enDescripcion = true;
        const fila: string[] = [];
        for (const item of linea.items) {
          const texto = item.str.trim();
          if (!texto || /^descripci[oó]n$/i.test(texto)) continue;
          if (item.x < xImpuestos - 2) { if (enDescripcion) descripcion.push(texto); } else fila.push(texto);
        }
        const impuesto = leerFilaImpuesto(fila);
        if (impuesto) filasImpuesto.push(impuesto);
      }
    }

    const indice = conceptos.length;
    const valor = (columna: ColumnaConcepto) => (celdas.get(columna) ?? []).join(' ').replace(/\s+/g, ' ').trim();
    // Algunos PAC solo traen la columna "Unidad" (con la clave, o con el nombre): se completa la otra con el catálogo.
    let claveUnidad = valor('claveUnidad');
    let unidad = valor('unidad');
    if (!claveUnidad && unidad) {
      if (/^[A-Z0-9]{2,3}$/.test(unidad)) { claveUnidad = unidad; unidad = CLAVE_UNIDAD[unidad] ?? ''; } else claveUnidad = porDescripcion(CLAVE_UNIDAD, unidad) ?? '';
    }
    const concepto: InvoiceConcepto = {
      claveProdServ: valor('claveProdServ') || claveDelTexto,
      noIdentificacion: valor('noIdentificacion'),
      cantidad: sinComas(valor('cantidad')),
      claveUnidad,
      unidad,
      descripcion: descripcion.join(' ').replace(/\s+/g, ' ').trim(),
      valorUnitario: sinComas(valor('valorUnitario')).replace(/^\$\s*/, ''),
      importe: sinComas(valor('importe')).replace(/^\$\s*/, ''),
      descuento: sinComas(valor('descuento')).replace(/^\$\s*/, ''),
      objetoImp: valor('objetoImp').match(/\b0[1-5]\b/)?.[0] ?? porDescripcion(OBJETO_IMP, valor('objetoImp')) ?? '',
    };
    const faltantes: Array<[keyof InvoiceConcepto, string]> = [
      ['claveUnidad', 'la clave de unidad'], ['cantidad', 'la cantidad'], ['descripcion', 'la descripción'],
      ['valorUnitario', 'el valor unitario'], ['importe', 'el importe'], ['objetoImp', 'el objeto de impuesto'],
    ];
    for (const [campo, nombre] of faltantes) if (!concepto[campo]) dudas.push({ campo: `conceptos.${indice}.${campo}`, motivo: `No se pudo leer ${nombre}` });
    conceptos.push(concepto);

    i = /^n[uú]mero de pedimento/i.test(lineas[fin]?.items[0]?.str.trim() ?? '') ? fin + 1 : fin;
  }
  return conceptos.length > 0 ? { conceptos, filasImpuesto } : vacio();
}

/** Resumen de impuestos: las tasas salen de las subtablas anidadas y los importes de los renglones de totales. */
function extraerImpuestos(lineas: Linea[], filas: FilaImpuestoLeida[], subtotal: string, ivaTotal: string, dudas: CampoDudoso[]): InvoiceImpuesto[] {
  const impuestos: InvoiceImpuesto[] = [];
  for (const linea of lineas) {
    const k = linea.items.findIndex((item) => /^(impuestos (trasladados|retenidos)|traslados?\s+(iva|isr|ieps)|retenci(o|on|ones)\s+(iva|isr|ieps))/.test(plano(item.str).trim()));
    if (k < 0) continue;
    const renglon = linea.items.slice(k).map((item) => item.str).join(' ');
    const etiqueta = plano(renglon);
    const nombre = etiqueta.match(/\b(iva|isr|ieps)\b/)?.[1] ?? '';
    if (!nombre) continue;
    const codigo = CODIGO_IMPUESTO[nombre];
    const importe = [...renglon.matchAll(RE.importe)].map((m) => sinComas(m[0])).pop() ?? '';
    const delImpuesto = filas.filter((fila) => fila.impuesto === codigo);
    const centavos = delImpuesto.reduce((suma, fila) => suma + Math.round(Number(fila.base) * 100), 0);
    impuestos.push({
      impuesto: codigo,
      tipo: /retenid|^retenci/.test(etiqueta) ? 'Retención' : 'Traslado',
      base: delImpuesto.length > 0 ? (centavos / 100).toFixed(2) : subtotal,
      tipoFactor: delImpuesto[0]?.tasaOCuota ? 'Tasa' : 'Exento',
      tasaOCuota: delImpuesto[0]?.tasaOCuota ?? '',
      importe,
    });
    if (!delImpuesto[0]?.tasaOCuota) dudas.push({ campo: `impuestos.${impuestos.length - 1}.tasaOCuota`, motivo: 'No se pudo leer la tasa o cuota' });
  }
  if (impuestos.length === 0 && ivaTotal) {
    impuestos.push({ impuesto: '002', tipo: 'Traslado', base: subtotal, tipoFactor: 'Tasa', tasaOCuota: filas[0]?.tasaOCuota ?? '0.160000', importe: ivaTotal });
    dudas.push({ campo: 'impuestos.0.impuesto', motivo: 'El desglose de impuestos no se pudo leer; se dedujo del total de IVA' });
  }
  return impuestos;
}

export function extraerDeTexto(lineas: Linea[], qr: DatosQr | null, archivo: { bytes: Uint8Array; nombre: string }): Extraccion {
  const dudas: CampoDudoso[] = [];
  const confirmadosQr: string[] = [];
  const todo = lineas.map((l) => l.texto).join('\n');
  // Primero el par "Etiqueta: valor" del mismo renglón (diseño SAT en dos columnas); si no, el valor debajo de la etiqueta.
  const leer = (alias: readonly string[], exacto = false): string => valorEnRenglon(lineas, alias) ?? valorDebajoDeEtiqueta(lineas, alias, exacto) ?? valorTrasEtiqueta(lineas, alias, 0, exacto)?.valor ?? '';

  // --- folio y RFC: el QR manda cuando existe
  const uuidTexto = (todo.match(RE.uuid)?.[0] ?? '').toUpperCase();
  let uuid = uuidTexto;
  const rfcDe = (alias: readonly string[]) => leer(alias).match(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/)?.[0] ?? '';
  let rfcProvCertif = rfcDe(ANCLAS.rfcProvCertif);
  // El RFC del proveedor de certificación (PAC) no es ni el del emisor ni el del receptor.
  const rfcsTexto = [...new Set(todo.match(RE.rfc) ?? [])].filter((rfc) => rfc !== rfcProvCertif);
  let rfcEmisor = rfcDe(['RFC emisor', 'RFC del emisor']) || rfcsTexto[0] || '';
  let rfcReceptor = rfcDe(['RFC receptor', 'RFC del receptor']) || rfcsTexto.find((rfc) => rfc !== rfcEmisor) || '';
  if (qr) {
    if (qr.id && uuidTexto && qr.id !== uuidTexto) dudas.push({ campo: 'uuid', motivo: `El folio del texto (${uuidTexto}) no coincide con el del QR; se usó el del QR` });
    else if (qr.id) confirmadosQr.push('uuid');
    uuid = qr.id || uuidTexto;
    if (qr.re) { if (rfcEmisor && rfcEmisor !== qr.re) dudas.push({ campo: 'emisor.rfc', motivo: 'El RFC del texto no coincide con el del QR; se usó el del QR' }); else confirmadosQr.push('emisor.rfc'); rfcEmisor = qr.re; }
    if (qr.rr) { if (rfcReceptor && rfcReceptor !== qr.rr) dudas.push({ campo: 'receptor.rfc', motivo: 'El RFC del texto no coincide con el del QR; se usó el del QR' }); else confirmadosQr.push('receptor.rfc'); rfcReceptor = qr.rr; }
  } else {
    dudas.push({ campo: 'qr', motivo: 'No se pudo leer el código QR; el folio, los RFC y el total no se confirmaron' });
    if (rfcsTexto.length < 2) dudas.push({ campo: 'receptor.rfc', motivo: 'No se encontraron los dos RFC en el texto' });
    else if (!rfcDe(['RFC emisor', 'RFC del emisor']) || !rfcDe(['RFC receptor', 'RFC del receptor'])) dudas.push({ campo: 'emisor.rfc', motivo: 'Emisor y receptor se asumieron por orden de aparición' });
  }

  // --- timbre
  const cpYFecha = leer(['Código postal, fecha y hora de emisión']) ?? '';
  const fechas = [...todo.matchAll(RE.fecha)].map((m) => normalizarFecha(m[0]));
  const series = [...new Set(todo.match(RE.serie20) ?? [])];
  const serieCSD = (leer(ANCLAS.serieCSD).match(/\d{20}/)?.[0]) ?? series[0] ?? '';
  let noCertificadoSAT = (leer(ANCLAS.noCertifSAT).match(/\d{20}/)?.[0]) ?? series[1] ?? '';
  let fechaCertificacion = normalizarFecha(leer(ANCLAS.fechaCertif).match(RE.fecha)?.[0] ?? fechas[1] ?? '');
  const fechaEmision = normalizarFecha(cpYFecha.match(RE.fecha)?.[0] ?? leer(['Fecha y hora de emisión de CFDI', 'Fecha de emisión', 'Fecha y hora de emisión', 'Fecha de expedición']).match(RE.fecha)?.[0] ?? fechas[0] ?? '');
  const selloCFD = seccionesDeTexto(lineas, ANCLAS.selloCFD, FINES_DE_SECCION);
  const selloSAT = seccionesDeTexto(lineas, ANCLAS.selloSAT, FINES_DE_SECCION);
  const cadenaBruta = seccionesDeTexto(lineas, ANCLAS.cadena, FINES_DE_SECCION);
  const inicioCadena = cadenaBruta.indexOf('||');
  const finCadena = cadenaBruta.lastIndexOf('||');
  let cadenaOriginal = inicioCadena >= 0 && finCadena > inicioCadena ? cadenaBruta.slice(inicioCadena, finCadena + 2) : '';
  // La cadena tiene el orden fijado por el SAT: ||versión|UUID|fecha de timbrado|RFC del PAC|sello CFDI|no. de certificado SAT||.
  // Es la fuente más confiable de esos datos: cada PAC maqueta (y a veces rotula) distinto.
  const partesCadena = cadenaOriginal ? cadenaOriginal.slice(2, -2).split('|') : [];
  if (partesCadena.length === 6 && /^\d+\.\d+$/.test(partesCadena[0])) {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(partesCadena[2])) fechaCertificacion = partesCadena[2];
    if (/^\d{20}$/.test(partesCadena[5])) noCertificadoSAT = partesCadena[5];
    if (!rfcProvCertif && /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(partesCadena[3])) rfcProvCertif = partesCadena[3];
  }
  if (!cadenaOriginal && uuid && fechaCertificacion && rfcProvCertif && selloCFD && noCertificadoSAT) {
    // Es determinista: se arma con los mismos datos del timbre.
    cadenaOriginal = `||1.1|${uuid}|${fechaCertificacion}|${rfcProvCertif}|${selloCFD}|${noCertificadoSAT}||`;
  }

  // --- encabezado y catálogos
  const lugarExpedicion = leer(['Lugar de expedición']).match(/\b\d{5}\b/)?.[0] ?? cpYFecha.match(/\b\d{5}\b/)?.[0] ?? '';
  const regimenPorEtiqueta = (alias: readonly string[], exacto: boolean): string => {
    const texto = leer(alias, exacto);
    const codigo = texto.match(/\b(6\d{2})\b/)?.[1];
    return codigo && codigo in REGIMEN_FISCAL ? codigo : porDescripcion(REGIMEN_FISCAL, texto) ?? '';
  };
  const codigoRegimen = (rfc: string): string => {
    const inicio = lineas.findIndex((linea) => rfc !== '' && linea.texto.includes(rfc));
    // Con dos columnas los renglones se intercalan: el régimen puede quedar varios renglones debajo del RFC.
    // Se prefiere el fragmento que dice "régimen" y se corta al llegar a la tabla de conceptos.
    const ventana: string[] = [];
    for (let i = Math.max(inicio, 0); inicio >= 0 && i < Math.min(lineas.length, inicio + 10); i++) {
      if (/^conceptos?$|^cantidad/i.test(lineas[i].items[0]?.str.trim() ?? '')) break;
      ventana.push(...lineas[i].items.map((item) => item.str));
    }
    for (const texto of [...ventana.filter((fragmento) => /r[eé]gimen/i.test(fragmento)), ...ventana]) {
      const codigo = texto.match(/\b(6\d{2})\b/)?.[1];
      if (codigo && codigo in REGIMEN_FISCAL) return codigo;
      const porNombre = porDescripcion(REGIMEN_FISCAL, texto);
      if (porNombre) return porNombre;
    }
    return '';
  };
  const usoTexto = leer(['Uso CFDI', 'Uso del CFDI']) ?? '';
  const usoCFDI = usoTexto.match(/\b(G0[1-3]|I0[1-8]|D(?:0[1-9]|10)|S01|CP01|CN01)\b/)?.[1] ?? porDescripcion(USO_CFDI, usoTexto) ?? '';
  const efectoTexto = leer(['Efecto de comprobante', 'Tipo de comprobante']) ?? '';
  const efectoComprobante = efectoTexto.match(/\b([IETNP])\b/)?.[1] ?? porDescripcion(TIPO_COMPROBANTE, efectoTexto) ?? (/CFDI\s*4\.0\s*·\s*INGRESO/i.test(todo) ? 'I' : '');
  const formaTexto = leer(['Forma de pago']) ?? '';
  const formaPago = formaTexto.match(/\b(\d{2})\b/)?.[1] ?? porDescripcion(FORMA_PAGO, formaTexto) ?? '';
  const metodoTexto = leer(['Método de pago']) ?? '';
  const metodoPago = metodoTexto.match(/\b(PUE|PPD)\b/)?.[1] ?? porDescripcion(METODO_PAGO, metodoTexto) ?? '';
  const monedaTexto = leer(['Moneda']);
  const moneda = monedaTexto.match(/\b[A-Z]{3}\b/)?.[0] ?? porDescripcion(MONEDA, monedaTexto) ?? '';
  const exportacionTexto = leer(['Exportación']);
  const exportacion = exportacionTexto.match(/\b0[1-4]\b/)?.[0] ?? porDescripcion(EXPORTACION, exportacionTexto) ?? '';
  const version = /CFDI\s*4\.0|Versi[oó]n\s*:?\s*4\.0/i.test(todo) ? '4.0' : '';
  const cpReceptor = leer(['Código postal del receptor', 'Domicilio fiscal']).match(/\b\d{5}\b/)?.[0] ?? '';

  // --- importes
  const subtotal = importesDespuesDe(lineas, ['Subtotal'])?.[0] ?? '';
  const ivaTotal = importesDespuesDe(lineas, ['IVA trasladado', 'Impuestos trasladados', 'Total impuestos trasladados'])?.pop() ?? '';
  let total = importesDespuesDe(lineas, ['Total'], /^total (impuestos|de)/)?.[0] ?? '';
  if (qr?.tt) {
    const ttNumero = Number(qr.tt);
    if (total && Math.abs(Number(total) - ttNumero) > 0.005) {
      dudas.push({ campo: 'total', motivo: `El total del texto (${total}) no coincide con el del QR (${ttNumero.toFixed(2)}); se usó el del QR` });
    } else confirmadosQr.push('total');
    total = ttNumero.toFixed(2);
  }

  const { conceptos, filasImpuesto } = extraerConceptos(lineas, dudas);
  const impuestos = extraerImpuestos(lineas, filasImpuesto, subtotal, ivaTotal, dudas);

  const invoice: InvoiceBorrador = {
    uuid,
    serieCSD,
    lugarExpedicion,
    fechaEmision,
    efectoComprobante: efectoComprobante || 'I',
    exportacion: exportacion || '01',
    version: version || '4.0',
    moneda: moneda || 'MXN',
    formaPago,
    metodoPago,
    emisor: { rfc: rfcEmisor, nombre: leer(['Nombre emisor', 'Nombre del emisor']) || nombreCercaDe(lineas, rfcEmisor), regimenFiscal: regimenPorEtiqueta(['Régimen fiscal'], true) || codigoRegimen(rfcEmisor) },
    receptor: { rfc: rfcReceptor, nombre: leer(['Nombre receptor', 'Nombre del receptor']) || nombreCercaDe(lineas, rfcReceptor), codigoPostal: cpReceptor, regimenFiscal: regimenPorEtiqueta(['Régimen fiscal receptor', 'Régimen fiscal del receptor'], false) || codigoRegimen(rfcReceptor), usoCFDI },
    conceptos,
    impuestos,
    subtotal,
    totalImpuestosTrasladados: ivaTotal || impuestos.filter((i) => i.tipo === 'Traslado').reduce((suma, i) => (suma + Number(i.importe)), 0).toFixed(2),
    totalImpuestosRetenidos: '',
    total,
    timbre: { selloCFD, selloSAT, cadenaOriginal, rfcProvCertif, fechaCertificacion, noCertificadoSAT },
    estado: 'timbrada',
    ...(qr ? { urlQrOriginal: qr.url } : {}),
    selloIncompleto: false,
    origen: 'pdf-texto',
    archivoOriginal: bufferToBase64(archivo.bytes),
    archivoTipo: 'pdf',
    archivoNombre: archivo.nombre,
    camposDudosos: [],
    confirmadosQr,
    revisadoPorUsuario: false,
    importadoEn: new Date().toISOString(),
  };

  // campos obligatorios que no aparecieron
  const obligatorios: Array<[string, string, string]> = [
    ['emisor.nombre', invoice.emisor.nombre, 'el nombre del emisor'], ['emisor.regimenFiscal', invoice.emisor.regimenFiscal, 'el régimen fiscal del emisor'],
    ['receptor.nombre', invoice.receptor.nombre, 'el nombre del receptor'], ['receptor.codigoPostal', invoice.receptor.codigoPostal, 'el código postal del receptor'],
    ['receptor.regimenFiscal', invoice.receptor.regimenFiscal, 'el régimen fiscal del receptor'], ['receptor.usoCFDI', invoice.receptor.usoCFDI, 'el uso del CFDI'],
    ['serieCSD', invoice.serieCSD, 'el No. de serie del CSD'], ['lugarExpedicion', invoice.lugarExpedicion, 'el lugar de expedición'],
    ['fechaEmision', invoice.fechaEmision, 'la fecha de emisión'], ['formaPago', invoice.formaPago, 'la forma de pago'], ['metodoPago', invoice.metodoPago, 'el método de pago'],
    ['subtotal', invoice.subtotal, 'el subtotal'], ['timbre.rfcProvCertif', invoice.timbre.rfcProvCertif, 'el RFC del proveedor de certificación'],
    ['timbre.fechaCertificacion', invoice.timbre.fechaCertificacion, 'la fecha de certificación'], ['timbre.noCertificadoSAT', invoice.timbre.noCertificadoSAT, 'el No. de serie del certificado SAT'],
  ];
  for (const [campo, valor, nombre] of obligatorios) if (!valor) dudas.push({ campo, motivo: `No se pudo leer ${nombre}` });
  if (!efectoComprobante) dudas.push({ campo: 'efectoComprobante', motivo: 'No se encontró el efecto de comprobante; se asumió Ingreso' });
  if (!exportacion) dudas.push({ campo: 'exportacion', motivo: 'No se encontró la clave de exportación; se asumió 01' });
  if (!moneda) dudas.push({ campo: 'moneda', motivo: 'No se encontró la moneda; se asumió MXN' });

  // integridad (sellos de 344, cadena, uuid, suma) + contraste del sello contra el QR
  const integridad = validarIntegridad(invoice);
  if (qr?.fe) {
    if (selloCFD.slice(-8) === qr.fe) confirmadosQr.push('timbre.selloCFD');
    else if (!integridad.some((d) => d.campo === 'timbre.selloCFD')) integridad.push({ campo: 'timbre.selloCFD', motivo: 'Los últimos 8 caracteres del sello no coinciden con el QR' });
  }
  invoice.camposDudosos = sinDuplicados([...integridad, ...dudas]);
  // Si un campo quedó dudoso no se marca como confirmado.
  invoice.confirmadosQr = confirmadosQr.filter((campo) => !invoice.camposDudosos.some((d) => d.campo === campo));
  return { invoice, dudas: invoice.camposDudosos };
}

export { CAMPOS_DE_INTEGRIDAD };
