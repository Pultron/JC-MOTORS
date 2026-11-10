import type { PublicQuotation } from '../models/quotation';
import { addDays, formatDate, parseDate } from '../utils/dateFormat';
import { formatMoney } from '../utils/money';
import { formatPhone } from '../validation/fields';

/** Design units: px on an A4 sheet at 96 dpi. jsPDF works in mm/pt, so the PDF converts with mm()/pt(). */
export const PAGE_W = 794;
export const PAGE_H = 1123;
export const MM = 210 / PAGE_W;
export const mm = (px: number): number => px * MM;
export const pt = (px: number): number => px * 0.75;

export const MARGIN_X = 44;
export const CONTENT_W = PAGE_W - MARGIN_X * 2;
export const BAND_TOP = 6;
export const BAND_BOTTOM = 5;
export const CONT_HEADER = 62;
export const CONT_NOTE = 24;
export const SLACK = 10;
export const MIN_LAST_SHEET_ROWS = 2;
export const MAX_CONCEPTS = 100;
export const LINE = 1.35;

/** The minimal slice of jsPDF the planner needs, so it can run with a fake in Node tests. */
export interface MeasureDoc {
  setFont(fontName: string, fontStyle?: string): unknown;
  setFontSize(size: number): unknown;
  splitTextToSize(text: string, maxWidth: number): string[];
}

export interface Mode {
  id: 'normal' | 'compact';
  padTop: number;
  logo: number; brand: number; title: number;
  folioPadY: number; folioPadX: number; folioFont: number; dateFont: number;
  sepTop: number; sepBot: number;
  cardPadT: number; cardPadX: number; cardPadB: number; cardRadius: number; cardTitle: number; cardIcon: number;
  rowPad: number; labelFont: number; valueFont: number;
  tableMargin: number; sectionFont: number;
  headH: number; headFont: number;
  rowMin: number; rowFont: number; rowPadY: number;
  colQty: number; colPrice: number; colAmount: number;
  blockMargin: number;
  totW: number; totRowH: number; barH: number; barLabel: number; barValue: number;
  bulletFont: number; bulletPad: number;
  obsPadT: number; obsPadX: number; obsPadB: number;
  authMargin: number; authPadT: number; authPadX: number; authPadB: number; signGap: number;
  footPadT: number; noteT: number; noteB: number;
}

export const NORMAL: Mode = {
  id: 'normal', padTop: 26, logo: 96, brand: 29, title: 30,
  folioPadY: 7, folioPadX: 20, folioFont: 14, dateFont: 12,
  sepTop: 16, sepBot: 18,
  cardPadT: 16, cardPadX: 22, cardPadB: 17, cardRadius: 14, cardTitle: 13, cardIcon: 28,
  rowPad: 5, labelFont: 12.5, valueFont: 14,
  tableMargin: 24, sectionFont: 15, headH: 40, headFont: 11.5,
  rowMin: 44, rowFont: 14, rowPadY: 12,
  colQty: 70, colPrice: 150, colAmount: 130,
  blockMargin: 22,
  totW: 292, totRowH: 32, barH: 62, barLabel: 16, barValue: 21,
  bulletFont: 13.5, bulletPad: 4,
  obsPadT: 12, obsPadX: 16, obsPadB: 13,
  authMargin: 24, authPadT: 20, authPadX: 26, authPadB: 24, signGap: 36,
  footPadT: 14, noteT: 12, noteB: 16,
};

export const COMPACT: Mode = {
  id: 'compact', padTop: 22, logo: 80, brand: 26, title: 26,
  folioPadY: 5, folioPadX: 16, folioFont: 13, dateFont: 11.5,
  sepTop: 14, sepBot: 16,
  cardPadT: 12, cardPadX: 20, cardPadB: 13, cardRadius: 12, cardTitle: 12, cardIcon: 24,
  rowPad: 2, labelFont: 12, valueFont: 13,
  tableMargin: 20, sectionFont: 14, headH: 32, headFont: 11,
  rowMin: 32, rowFont: 13, rowPadY: 6,
  colQty: 64, colPrice: 140, colAmount: 120,
  blockMargin: 18,
  totW: 286, totRowH: 26, barH: 52, barLabel: 15, barValue: 20,
  bulletFont: 12.5, bulletPad: 2,
  obsPadT: 9, obsPadX: 14, obsPadB: 10,
  authMargin: 20, authPadT: 14, authPadX: 24, authPadB: 16, signGap: 28,
  footPadT: 12, noteT: 10, noteB: 14,
};

export interface Sheet {
  /** Items printed on this sheet, in order. */
  filas: PublicQuotation['items'];
  /** Height of each printed row, same order as `filas`. */
  altos: number[];
  /** Only the last sheet carries conditions, totals and the signature. */
  final: boolean;
}

export interface Plan {
  modo: Mode;
  /** Measured blocks the PDF must draw, so preview and PDF can never disagree. */
  blocks: Blocks;
  hojas: Sheet[];
}

export { formatPhone };

/** Quotation expiry: the local calendar day of creation plus validityDays (no UTC drift, DST safe). */
export function validUntil(quotation: Pick<PublicQuotation, 'createdAt' | 'validityDays'>): Date {
  const created = parseDate(quotation.createdAt) ?? new Date();
  return addDays(created, quotation.validityDays);
}

export function conditionsFor(quotation: PublicQuotation): string[] {
  return [
    `Cotización válida hasta el ${formatDate(validUntil(quotation), 'long')}.`,
    'Precios sujetos a revisión y disponibilidad de refacciones.',
    'Cualquier trabajo adicional requiere autorización del cliente.',
    'Garantía aplicable según el servicio o refacción.',
    ...(quotation.includeVat ? [] : ['Precios sin IVA; se agregará al solicitar factura.']),
  ];
}

/** Observations are printed exactly as the user typed them, apart from the fixed conditions. */
export function observationsFor(quotation: PublicQuotation): string {
  return [quotation.customerNotes, quotation.publicNotes]
    .map((note) => note?.trim() ?? '')
    .filter(Boolean)
    .join('\n');
}

export interface TotalRow { label: string; value: string; tone?: 'discount' }

export function totalRowsFor(quotation: PublicQuotation): TotalRow[] {
  const rows: TotalRow[] = [
    { label: 'Refacciones', value: formatMoney(quotation.subtotalRefacciones, 'pdf') },
    { label: 'Mano de obra', value: formatMoney(quotation.subtotalManoObra, 'pdf') },
  ];
  if (quotation.laborDiscount > 0) {
    const percent = quotation.laborDiscountPercent;
    rows.push({
      label: percent ? `Descuento M.O. (${percent}%)` : 'Descuento M.O.',
      value: `− ${formatMoney(quotation.laborDiscount, 'pdf')}`,
      tone: 'discount',
    });
  }
  rows.push({ label: 'Subtotal', value: formatMoney(quotation.subtotalNeto, 'pdf') });
  rows.push({
    label: quotation.includeVat ? 'IVA (16%)' : 'IVA no incluido',
    value: formatMoney(quotation.ivaAmount, 'pdf'),
  });
  return rows;
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

function setText(doc: MeasureDoc, font: 'Inter' | 'InterXB', style: 'normal' | 'bold', sizePx: number): void {
  doc.setFont(font, style);
  doc.setFontSize(pt(sizePx));
}

export const rowTextWidth = (mode: Mode): number => CONTENT_W - mode.colQty - mode.colPrice - mode.colAmount - 24;

/** Real height of one table row, measured with the text already wrapped. */
export function altoFila(doc: MeasureDoc, concepto: string, mode: Mode): number {
  setText(doc, 'Inter', 'normal', mode.rowFont);
  const lineas = doc.splitTextToSize(concepto || '—', mm(rowTextWidth(mode)));
  return Math.max(mode.rowMin, lineas.length * mode.rowFont * LINE + mode.rowPadY * 2);
}

export const cardWidth = (): number => (CONTENT_W - 16) / 2;
export const CARD_LABEL_W = 104;

export interface CardRowData { label: string; value: string }

export function customerRows(quotation: PublicQuotation): CardRowData[] {
  return [
    { label: 'Nombre', value: quotation.customer.name },
    { label: 'Teléfono', value: quotation.customer.phone ? formatPhone(quotation.customer.phone) : '—' },
    { label: 'Correo', value: quotation.customer.email || '—' },
  ];
}

export function vehicleRows(quotation: PublicQuotation): CardRowData[] {
  return [
    { label: 'Marca y modelo', value: [quotation.vehicle.make, quotation.vehicle.model].filter(Boolean).join(' ') || '—' },
    { label: 'Año', value: quotation.vehicle.year ? String(quotation.vehicle.year) : '—' },
    { label: 'Placas', value: quotation.vehicle.plates || '—' },
  ];
}

export function cardRowHeights(doc: MeasureDoc, rows: CardRowData[], mode: Mode): number[] {
  setText(doc, 'Inter', 'bold', mode.valueFont);
  const valueWidth = cardWidth() - mode.cardPadX * 2 - CARD_LABEL_W;
  return rows.map((row) => {
    const lines = doc.splitTextToSize(row.value, mm(valueWidth)).length;
    return mode.rowPad * 2 + lines * mode.valueFont * LINE;
  });
}

export function headerHeight(mode: Mode): number {
  const chip = mode.folioPadY * 2 + mode.folioFont * 1.2;
  const right = mode.title * 1.15 + 8 + chip + 8 + 2 * mode.dateFont * 1.45;
  return Math.max(mode.logo, right);
}

export interface Blocks {
  header: number;
  separator: number;
  cards: number;
  cardRows: { customer: number[]; vehicle: number[] };
  sectionTitle: number;
  conditions: string[];
  conditionLines: string[][];
  bulletsHeight: number;
  observations: string;
  observationLines: string[];
  observationsHeight: number;
  leftHeight: number;
  totalRows: TotalRow[];
  totalsHeight: number;
  /** Conditions and totals sit side by side, so the taller column sets the block. */
  conditionsAndTotals: number;
  auth: number;
  footer: number;
}

export const conditionsWidth = (mode: Mode): number => CONTENT_W - mode.totW - 28;
export const BULLET_INDENT = 18;
export const COND_TITLE_H = 26;
const OBS_TITLE_H = 18;

/**
 * `rowReserve` is the height the last sheet must keep free for its minimum concept rows. Only when the observations are so
 * long that conditions + totals + signature would leave no room for those rows, the observations are cut with an ellipsis.
 */
export function describe(doc: MeasureDoc, quotation: PublicQuotation, mode: Mode, rowReserve = 0): Blocks {
  const customer = cardRowHeights(doc, customerRows(quotation), mode);
  const vehicle = cardRowHeights(doc, vehicleRows(quotation), mode);
  const cards = mode.cardPadT + Math.max(mode.cardIcon, mode.cardTitle * 1.3) + 12
    + Math.max(sum(customer), sum(vehicle)) + mode.cardPadB;

  const conditions = conditionsFor(quotation);
  setText(doc, 'Inter', 'normal', mode.bulletFont);
  const bulletWidth = mm(conditionsWidth(mode) - BULLET_INDENT);
  const conditionLines = conditions.map((text) => doc.splitTextToSize(text, bulletWidth));
  const bulletsHeight = sum(conditionLines.map((lines) => lines.length * mode.bulletFont * LINE + mode.bulletPad * 2));

  const observations = observationsFor(quotation);
  setText(doc, 'Inter', 'bold', mode.bulletFont);
  let observationLines = observations
    ? doc.splitTextToSize(observations, mm(conditionsWidth(mode) - mode.obsPadX * 2))
    : [];
  const authLine = 14 * 1.4;
  const auth = mode.authMargin + mode.authPadT + 15 * 1.25 + 4 + mode.bulletFont * 1.4
    + mode.signGap + authLine + mode.authPadB;
  const footer = mode.footPadT + 1 + 12 + 2 * 13 * 1.4 + mode.noteT + 12 * 1.4 + mode.noteB;
  const separator = mode.sepTop + 1 + mode.sepBot;
  if (observations && rowReserve > 0) {
    const fixed = BAND_TOP + mode.padTop + CONT_HEADER + separator + mode.headH + mode.blockMargin + auth + footer + BAND_BOTTOM + SLACK;
    const room = PAGE_H - fixed - rowReserve - (COND_TITLE_H + bulletsHeight + 14 + mode.obsPadT + OBS_TITLE_H + mode.obsPadB);
    const fitting = Math.max(1, Math.floor(room / (mode.bulletFont * LINE)));
    if (observationLines.length > fitting) {
      observationLines = observationLines.slice(0, fitting);
      observationLines[fitting - 1] = `${observationLines[fitting - 1].slice(0, -1).trimEnd()}…`;
    }
  }
  const observationsHeight = observations
    ? mode.obsPadT + OBS_TITLE_H + observationLines.length * mode.bulletFont * LINE + mode.obsPadB
    : 0;
  const leftHeight = COND_TITLE_H + bulletsHeight + (observations ? 14 + observationsHeight : 0);

  const totalRows = totalRowsFor(quotation);
  const totalsHeight = totalRows.length * mode.totRowH + mode.barH;

  return {
    header: mode.padTop + headerHeight(mode),
    separator,
    cards,
    cardRows: { customer, vehicle },
    sectionTitle: mode.tableMargin + mode.sectionFont * 1.25 + 10,
    conditions,
    conditionLines,
    bulletsHeight,
    observations,
    observationLines,
    observationsHeight,
    leftHeight,
    totalRows,
    totalsHeight,
    conditionsAndTotals: Math.max(leftHeight, totalsHeight),
    auth,
    footer,
  };
}

const bottomReserve = (blocks: Blocks): number => blocks.footer + BAND_BOTTOM + SLACK;

export function fijoUnaHoja(blocks: Blocks, mode: Mode): number {
  return BAND_TOP + blocks.header + blocks.separator + blocks.cards + blocks.sectionTitle + mode.headH
    + mode.blockMargin + blocks.conditionsAndTotals + blocks.auth + bottomReserve(blocks);
}

export function fijoPrimera(blocks: Blocks, mode: Mode): number {
  return BAND_TOP + blocks.header + blocks.separator + blocks.cards + blocks.sectionTitle + mode.headH
    + CONT_NOTE + bottomReserve(blocks);
}

export function fijoIntermedia(blocks: Blocks, mode: Mode): number {
  return BAND_TOP + mode.padTop + CONT_HEADER + blocks.separator + mode.headH + CONT_NOTE + bottomReserve(blocks);
}

export function fijoUltima(blocks: Blocks, mode: Mode): number {
  return fijoIntermedia(blocks, mode) - CONT_NOTE + mode.blockMargin + blocks.conditionsAndTotals + blocks.auth;
}

/**
 * Single source of truth for sheet count and density, shared by the PDF generator and the form counter.
 * Never decides by number of concepts: it measures each row with its text already wrapped.
 */
export function planificar(doc: MeasureDoc, quotation: PublicQuotation): Plan {
  const items = quotation.items;

  for (const mode of [NORMAL, COMPACT]) {
    const blocks = describe(doc, quotation, mode);
    const altos = items.map((item) => altoFila(doc, item.description, mode));
    if (fijoUnaHoja(blocks, mode) + sum(altos) <= PAGE_H) {
      return { modo: mode, blocks, hojas: [{ filas: items, altos, final: true }] };
    }
  }

  const mode = COMPACT;
  const altos = items.map((item) => altoFila(doc, item.description, mode));
  const minLast = Math.min(MIN_LAST_SHEET_ROWS, items.length);
  const tallest = [...altos].sort((a, b) => b - a).slice(0, minLast);
  const blocks = describe(doc, quotation, mode, sum(tallest));
  const capUltima = PAGE_H - fijoUltima(blocks, mode);
  const hojas: Sheet[] = [];
  let i = 0;

  while (true) {
    // The final sheet is never empty: with <= minLast rows left they all go on it, so it cannot hold only totals and signature.
    if (altos.length - i <= minLast || sum(altos.slice(i)) <= capUltima) {
      hojas.push({ filas: items.slice(i), altos: altos.slice(i), final: true });
      break;
    }
    const cap = PAGE_H - (hojas.length === 0 ? fijoPrimera(blocks, mode) : fijoIntermedia(blocks, mode));
    let n = 0;
    let usado = 0;
    while (i + n < altos.length && usado + altos[i + n] <= cap) usado += altos[i + n++];
    // Keep at least MIN_LAST_SHEET_ROWS rows for the last sheet so it never carries only totals and signature.
    n = Math.max(1, Math.min(n, altos.length - i - minLast));
    hojas.push({ filas: items.slice(i, i + n), altos: altos.slice(i, i + n), final: false });
    i += n;
  }
  return { modo: mode, blocks, hojas };
}

// ---------------------------------------------------------------- footer contacts
export const FOOTER_ICON_OFFSET = 26;
export const FOOTER_MIN_GAP = 20;

export interface FooterContactInput {
  /** Widest address line, in design px at the base font size. */
  addressWidth: number;
  /** Text widths in design px; 0 or undefined when the datum is missing. */
  phoneWidth?: number;
  emailWidth?: number;
}

export interface FooterContactLayout {
  /** 'row': address, phone and email on one line. 'stacked': phone drops under the email, right-aligned. */
  mode: 'row' | 'stacked';
  /** Font scale (1 = normal); only below 1 when even the stacked layout would overlap. */
  scale: number;
  /** Row mode only: x of the phone icon (the text follows at x + FOOTER_ICON_OFFSET). */
  phoneX?: number;
}

/**
 * Places the footer contacts from measured text widths, so nothing is hard-coded and nothing overlaps.
 * The phone is centred in the free space between address and email; if it does not fit there it moves to the line below.
 */
export function layoutFooterContacts({ addressWidth, phoneWidth = 0, emailWidth = 0 }: FooterContactInput): FooterContactLayout {
  const right = MARGIN_X + CONTENT_W;
  const offset = FOOTER_ICON_OFFSET;
  const rowFit = (scale: number): { free: number; block: number; lead: number } => {
    const lead = MARGIN_X + offset + addressWidth * scale;
    const emailLeft = emailWidth ? right - emailWidth * scale - offset : right;
    return { free: emailLeft - lead, block: phoneWidth * scale + offset, lead };
  };

  if (!phoneWidth) return { mode: 'row', scale: 1 };
  const base = rowFit(1);
  if (base.free >= base.block + 2 * FOOTER_MIN_GAP) return { mode: 'row', scale: 1, phoneX: base.lead + (base.free - base.block) / 2 };

  if (emailWidth) {
    const rightColumn = Math.max(emailWidth, phoneWidth) + offset;
    if (right - rightColumn - (MARGIN_X + offset + addressWidth) >= FOOTER_MIN_GAP) return { mode: 'stacked', scale: 1 };
    const scale = Math.min(1, Math.max(0.6, (CONTENT_W - 2 * offset - FOOTER_MIN_GAP) / (addressWidth + Math.max(emailWidth, phoneWidth))));
    return { mode: 'stacked', scale };
  }

  const scale = Math.min(1, Math.max(0.6, (CONTENT_W - 2 * offset - 2 * FOOTER_MIN_GAP) / (addressWidth + phoneWidth)));
  const fit = rowFit(scale);
  return { mode: 'row', scale, phoneX: fit.lead + (fit.free - fit.block) / 2 };
}
