import { jsPDF } from 'jspdf';
import type { PublicQuotation } from '../models/quotation';
import {
  BAND_BOTTOM, BAND_TOP, BULLET_INDENT, CARD_LABEL_W, COND_TITLE_H, CONT_HEADER, CONTENT_W, FOOTER_ICON_OFFSET, LINE, MARGIN_X,
  PAGE_H, PAGE_W, cardWidth, conditionsWidth, customerRows, headerHeight, isPairedLaborRow, layoutFooterContacts, mm, planificar, pt,
  rowTextWidth, validUntil, vehicleRows,
} from '../services/quotationLayout';
import type { Blocks, CardRowData, Mode, Sheet } from '../services/quotationLayout';
import { DEFAULT_BUSINESS_INFO, addressLines, loadBusinessInfo } from '../config/businessInfo';
import type { BusinessInfo } from '../config/businessInfo';
import { formatDate } from './dateFormat';
import { formatMoney } from './money';
import { registerFonts } from './pdfAssets';
import type { PdfAssets } from './pdfAssets';
import { drawIcon } from './pdfIcons';
import type { IconName } from './pdfIcons';


const C = {
  navy: '#13294B', orange: '#F97316', orangeDark: '#C2410C', orangeLight: '#FF8A3D',
  text: '#13294B', text2: '#2B3B52', muted: '#4B5B70',
  card: '#F3F6FA', line: '#E3E9F1', sep: '#D5DEEA',
  obsBg: '#FFF7ED', laborBg: '#FFF3E8', laborBadge: '#FDE3CF', pairBg: '#FFF4EA', pairTag: '#9A3412', green: '#1B7A3E', white: '#FFFFFF',
} as const;

const RIGHT = PAGE_W - MARGIN_X;
const BAND_SPLIT_TOP = 0.55;
const BAND_SPLIT_BOTTOM = 0.45;
// Inter metrics: ascender / content-area ratio used to place baselines from the top of a line box.
const ASCENT = 0.969;
const CONTENT_AREA = 1.21;

type FontName = 'Inter' | 'InterXB';
interface TextOptions { size: number; font?: FontName; bold?: boolean; color?: string; align?: 'left' | 'right' | 'center' }

class Page {
  readonly doc: jsPDF;

  constructor(doc: jsPDF) {
    this.doc = doc;
  }

  rect(x: number, y: number, w: number, h: number, color: string, radius = 0): void {
    this.doc.setFillColor(color);
    if (radius > 0) this.doc.roundedRect(mm(x), mm(y), mm(w), mm(h), mm(radius), mm(radius), 'F');
    else this.doc.rect(mm(x), mm(y), mm(w), mm(h), 'F');
  }

  stroke(x: number, y: number, w: number, h: number, color: string, width: number, radius = 0): void {
    this.doc.setDrawColor(color);
    this.doc.setLineWidth(mm(width));
    if (radius > 0) this.doc.roundedRect(mm(x), mm(y), mm(w), mm(h), mm(radius), mm(radius), 'S');
    else this.doc.rect(mm(x), mm(y), mm(w), mm(h), 'S');
  }

  hline(x1: number, x2: number, y: number, color: string, width = 1): void {
    this.doc.setDrawColor(color);
    this.doc.setLineWidth(mm(width));
    this.doc.line(mm(x1), mm(y), mm(x2), mm(y));
  }

  circle(x: number, y: number, r: number, color: string): void {
    this.doc.setFillColor(color);
    this.doc.circle(mm(x), mm(y), mm(r), 'F');
  }

  font(options: TextOptions): void {
    this.doc.setFont(options.font ?? 'Inter', options.font === 'InterXB' ? 'normal' : options.bold ? 'bold' : 'normal');
    this.doc.setFontSize(pt(options.size));
    this.doc.setTextColor(options.color ?? C.text);
  }

  width(text: string, options: TextOptions): number {
    this.font(options);
    return this.doc.getTextWidth(text) / (210 / PAGE_W);
  }

  /** Draws text whose line box starts at `top` (px); a string array renders as consecutive lines. */
  text(content: string | string[], x: number, top: number, options: TextOptions): void {
    this.font(options);
    const lineHeight = options.size * LINE;
    const baseline = top + (lineHeight - options.size * CONTENT_AREA) / 2 + options.size * ASCENT;
    this.doc.text(content, mm(x), mm(baseline), { align: options.align ?? 'left' });
  }

  /** Single line vertically centred inside a box. */
  middle(content: string, x: number, y: number, h: number, options: TextOptions): void {
    this.text(content, x, y + (h - options.size * LINE) / 2, options);
  }

  icon(name: IconName, x: number, y: number, size: number, color: string): void {
    drawIcon(this.doc, name, mm(x), mm(y), mm(size), color);
  }
}

export function buildQuotationPdf(quotation: PublicQuotation, assets: PdfAssets): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  registerFonts(doc, assets);
  doc.setLineHeightFactor(LINE);
  const plan = planificar(doc, quotation);
  const blocks = plan.blocks;
  const page = new Page(doc);
  const business = loadBusinessInfo();

  plan.hojas.forEach((sheet, index) => {
    if (index > 0) doc.addPage();
    drawBands(page);
    let y = BAND_TOP + plan.modo.padTop;
    if (index === 0) {
      y = drawMainHeader(page, quotation, assets, plan.modo, y, business);
      y = drawSeparator(page, plan.modo, y);
      y = drawCards(page, quotation, plan.modo, blocks, y);
      y += plan.modo.tableMargin;
      y = drawSectionTitle(page, 'SERVICIOS Y REFACCIONES', plan.modo.sectionFont, y);
    } else {
      drawContinuationHeader(page, quotation, assets, index + 1, plan.hojas.length, y, business);
      y = drawSeparator(page, plan.modo, y + CONT_HEADER);
    }
    y = drawTable(page, plan.modo, sheet, y);
    if (sheet.final) {
      y += plan.modo.blockMargin;
      const blockTop = y;
      drawConditions(page, plan.modo, blocks, blockTop);
      drawTotals(page, plan.modo, blocks, quotation.total, blockTop);
      drawAuthorization(page, plan.modo, blocks, blockTop + blocks.conditionsAndTotals);
    } else {
      page.text('Continúa en la siguiente hoja →', RIGHT, PAGE_H - BAND_BOTTOM - blocks.footer - 28, { size: 11, color: C.muted, align: 'right' });
    }
    drawFooter(page, plan.modo, blocks, index + 1, plan.hojas.length, business);
  });
  return doc;
}

function drawBands(page: Page): void {
  page.rect(0, 0, PAGE_W * BAND_SPLIT_TOP, BAND_TOP, C.navy);
  page.rect(PAGE_W * BAND_SPLIT_TOP, 0, PAGE_W * (1 - BAND_SPLIT_TOP), BAND_TOP, C.orange);
  page.rect(0, PAGE_H - BAND_BOTTOM, PAGE_W * BAND_SPLIT_BOTTOM, BAND_BOTTOM, C.orange);
  page.rect(PAGE_W * BAND_SPLIT_BOTTOM, PAGE_H - BAND_BOTTOM, PAGE_W * (1 - BAND_SPLIT_BOTTOM), BAND_BOTTOM, C.navy);
}

function drawLogo(page: Page, assets: PdfAssets, x: number, y: number, size: number): void {
  if (!assets.logo) return;
  try {
    page.doc.addImage(assets.logo, 'PNG', mm(x), mm(y), mm(size), mm(size));
  } catch {
    // The header keeps the business name even if the logo cannot be embedded.
  }
}

/** Draws "label value" right-aligned, with the value in bold. */
function drawDateLine(page: Page, label: string, value: string, top: number, size: number, valueColor: string): void {
  const valueWidth = page.width(value, { size, bold: true });
  page.text(value, RIGHT, top, { size, bold: true, color: valueColor, align: 'right' });
  page.text(label, RIGHT - valueWidth, top, { size, color: C.muted, align: 'right' });
}

function drawMainHeader(page: Page, quotation: PublicQuotation, assets: PdfAssets, mode: Mode, y: number, business: BusinessInfo): number {
  const height = headerHeight(mode);
  const logoY = y + (height - mode.logo) / 2;
  drawLogo(page, assets, MARGIN_X, logoY, mode.logo);

  const textX = MARGIN_X + mode.logo + 16;
  const brandH = mode.brand * 1.1;
  const subtitleSize = 13;
  const blockH = brandH + 4 + subtitleSize * 1.3;
  const blockTop = logoY + (mode.logo - blockH) / 2;
  page.text(business.nombre, textX, blockTop, { size: mode.brand, font: 'InterXB', color: C.navy });
  page.text('Servicio y mantenimiento automotriz', textX, blockTop + brandH + 4, { size: subtitleSize, color: C.muted });

  page.text('COTIZACIÓN', RIGHT, y, { size: mode.title, font: 'InterXB', color: C.navy, align: 'right' });
  const chipTop = y + mode.title * 1.15 + 8;
  const folio = `Folio: ${quotation.folio}`;
  const chipW = page.width(folio, { size: mode.folioFont, bold: true }) + mode.folioPadX * 2;
  const chipH = mode.folioPadY * 2 + mode.folioFont * 1.2;
  page.rect(RIGHT - chipW, chipTop, chipW, chipH, C.navy, 8);
  page.middle(folio, RIGHT - chipW / 2, chipTop, chipH, { size: mode.folioFont, bold: true, color: C.white, align: 'center' });

  const datesTop = chipTop + chipH + 8;
  drawDateLine(page, 'Fecha de emisión: ', formatDate(quotation.createdAt, 'long'), datesTop, mode.dateFont, C.navy);
  drawDateLine(page, 'Válida hasta: ', formatDate(validUntil(quotation), 'long'), datesTop + mode.dateFont * 1.45, mode.dateFont, C.orangeDark);
  return y + height;
}

function drawContinuationHeader(page: Page, quotation: PublicQuotation, assets: PdfAssets, sheetNumber: number, sheets: number, y: number, business: BusinessInfo): void {
  const logo = 36;
  const logoY = y + (CONT_HEADER - logo) / 2;
  drawLogo(page, assets, MARGIN_X, logoY, logo);
  page.middle(business.nombre, MARGIN_X + logo + 12, logoY, logo, { size: 16, font: 'InterXB', color: C.navy });
  page.text('COTIZACIÓN', RIGHT, y + 8, { size: 14, bold: true, color: C.navy, align: 'right' });
  page.text(`Folio: ${quotation.folio} · Hoja ${sheetNumber} de ${sheets}`, RIGHT, y + 8 + 14 * LINE + 4, { size: 12, color: C.muted, align: 'right' });
}

function drawSeparator(page: Page, mode: Mode, y: number): number {
  page.hline(MARGIN_X, RIGHT, y + mode.sepTop, C.sep);
  return y + mode.sepTop + 1 + mode.sepBot;
}

function drawCards(page: Page, quotation: PublicQuotation, mode: Mode, blocks: Blocks, y: number): number {
  const width = cardWidth();
  drawCard(page, mode, MARGIN_X, y, width, blocks.cards, 'DATOS DEL CLIENTE', 'person', customerRows(quotation), blocks.cardRows.customer);
  drawCard(page, mode, MARGIN_X + width + 16, y, width, blocks.cards, 'DATOS DEL VEHÍCULO', 'car', vehicleRows(quotation), blocks.cardRows.vehicle);
  return y + blocks.cards;
}

function drawCard(
  page: Page, mode: Mode, x: number, y: number, width: number, height: number,
  title: string, icon: IconName, rows: CardRowData[], rowHeights: number[],
): void {
  page.rect(x, y, width, height, C.card, mode.cardRadius);
  const iconX = x + mode.cardPadX;
  const iconY = y + mode.cardPadT;
  page.rect(iconX, iconY, mode.cardIcon, mode.cardIcon, C.orange, 7);
  page.icon(icon, iconX + mode.cardIcon * 0.18, iconY + mode.cardIcon * 0.18, mode.cardIcon * 0.64, C.white);
  page.middle(title, iconX + mode.cardIcon + 10, iconY, mode.cardIcon, { size: mode.cardTitle, bold: true, color: C.navy });

  let rowY = iconY + Math.max(mode.cardIcon, mode.cardTitle * 1.3) + 12;
  const valueWidth = width - mode.cardPadX * 2 - CARD_LABEL_W;
  rows.forEach((row, index) => {
    page.text(row.label, x + mode.cardPadX, rowY + mode.rowPad, { size: mode.labelFont, color: C.muted });
    page.font({ size: mode.valueFont, bold: true });
    const lines = page.doc.splitTextToSize(row.value, mm(valueWidth)) as string[];
    page.text(lines, x + mode.cardPadX + CARD_LABEL_W, rowY + mode.rowPad, { size: mode.valueFont, bold: true, color: C.navy });
    rowY += rowHeights[index];
  });
}

function drawSectionTitle(page: Page, title: string, size: number, y: number): number {
  const height = size * 1.25;
  page.rect(MARGIN_X, y, 4, height, C.orange, 2);
  page.middle(title, MARGIN_X + 14, y, height, { size, bold: true, color: C.navy });
  return y + height + 10;
}

/** The "↳" mark drawn as lines (the Inter font has no glyph for it): down from the service, then right with an arrow head. */
function drawCornerArrow(page: Page, x: number, centerY: number, size: number): void {
  const top = centerY - size * 0.6;
  const bottom = centerY + size * 0.3;
  const right = x + size;
  const doc = page.doc;
  doc.setDrawColor(C.orange);
  doc.setLineWidth(mm(1.4));
  doc.line(mm(x), mm(top), mm(x), mm(bottom));
  doc.line(mm(x), mm(bottom), mm(right), mm(bottom));
  doc.line(mm(right - size * 0.35), mm(bottom - size * 0.3), mm(right), mm(bottom));
  doc.line(mm(right - size * 0.35), mm(bottom + size * 0.3), mm(right), mm(bottom));
}

function drawTable(page: Page, mode: Mode, sheet: Sheet, y: number): number {
  const rowsH = sheet.altos.reduce((total, value) => total + value, 0);
  const radius = 10;
  const qtyX = MARGIN_X + CONTENT_W - mode.colAmount - mode.colPrice - mode.colQty;
  const priceEnd = MARGIN_X + CONTENT_W - mode.colAmount;

  // jsPDF cannot round only the top corners: round the whole header, then cover its lower corners.
  page.rect(MARGIN_X, y, CONTENT_W, mode.headH + radius, C.navy, radius);
  page.rect(MARGIN_X, y + mode.headH, CONTENT_W, radius, C.white);
  const head = { size: mode.headFont, bold: true, color: C.white } as const;
  page.middle('CONCEPTO', MARGIN_X + 16, y, mode.headH, head);
  page.middle('CANT.', qtyX + mode.colQty / 2, y, mode.headH, { ...head, align: 'center' });
  page.middle('PRECIO UNITARIO', priceEnd - 16, y, mode.headH, { ...head, align: 'right' });
  page.middle('IMPORTE', RIGHT - 16, y, mode.headH, { ...head, align: 'right' });

  let rowY = y + mode.headH;
  sheet.filas.forEach((item, index) => {
    const height = sheet.altos[index];
    page.font({ size: mode.rowFont });
    const isLabor = item.type === 'labor';
    // Labor printed under its own service gets the per-service look; an old quotation's loose labor row keeps the original one.
    const paired = isPairedLaborRow(sheet.filas, index);
    const isLast = index === sheet.filas.length - 1;
    const lines = page.doc.splitTextToSize(item.description || '—', mm(rowTextWidth(mode))) as string[];
    const textTop = rowY + (height - lines.length * mode.rowFont * LINE) / 2;
    const textX = MARGIN_X + (paired ? 40 : isLabor ? 20 : 16);
    if (isLabor) {
      // Labor rows get a peach background and an orange edge; the last row must follow the table's rounded corners.
      const background = paired ? C.pairBg : C.laborBg;
      if (isLast) {
        page.rect(MARGIN_X, rowY, CONTENT_W, height, background, radius);
        page.rect(MARGIN_X, rowY, CONTENT_W, radius, background);
      } else {
        page.rect(MARGIN_X, rowY, CONTENT_W, height, background);
      }
      page.rect(MARGIN_X, rowY, paired ? 3 : 4, height - (isLast ? radius * 0.6 : 0), C.orange);
    }
    if (paired) drawCornerArrow(page, MARGIN_X + 18, rowY + height / 2, mode.rowFont * 0.8);
    page.text(lines, textX, textTop, { size: mode.rowFont, color: C.text });
    if (isLabor) {
      const badgeFont = Math.max(7, mode.rowFont * 0.7);
      const badgeW = page.width('M.O.', { size: badgeFont, bold: true }) + 12;
      const badgeH = badgeFont * 1.9;
      const badgeX = textX + page.width(lines[0], { size: mode.rowFont }) + 10;
      const badgeY = textTop + (mode.rowFont * LINE - badgeH) / 2;
      page.rect(badgeX, badgeY, badgeW, badgeH, C.laborBadge, 3);
      page.middle('M.O.', badgeX + badgeW / 2, badgeY, badgeH, { size: badgeFont, bold: true, color: paired ? C.pairTag : C.orangeDark, align: 'center' });
    }
    page.middle(String(item.quantity), qtyX + mode.colQty / 2, rowY, height, { size: mode.rowFont, color: C.text, align: 'center' });
    page.middle(formatMoney(item.saleUnitPrice, 'pdf'), priceEnd - 16, rowY, height, { size: mode.rowFont, color: C.text2, align: 'right' });
    page.middle(formatMoney(item.amount, 'pdf'), RIGHT - 16, rowY, height, { size: mode.rowFont, bold: true, color: isLabor ? C.orangeDark : C.navy, align: 'right' });
    // Dividers separate groups only: none between a service and its own labor line.
    const nextIsItsLabor = index < sheet.filas.length - 1 && isPairedLaborRow(sheet.filas, index + 1);
    if (index < sheet.filas.length - 1 && !nextIsItsLabor) page.hline(MARGIN_X, RIGHT, rowY + height, C.line);
    rowY += height;
  });
  page.stroke(MARGIN_X, y, CONTENT_W, mode.headH + rowsH, C.line, 1, radius);
  return y + mode.headH + rowsH;
}

function drawConditions(page: Page, mode: Mode, blocks: Blocks, top: number): void {
  const width = conditionsWidth(mode);
  page.rect(MARGIN_X, top + 4, 3, 16, C.orange, 1.5);
  page.middle('CONDICIONES', MARGIN_X + 12, top, 24, { size: 15, bold: true, color: C.navy });

  let y = top + COND_TITLE_H;
  blocks.conditionLines.forEach((lines) => {
    const lineHeight = mode.bulletFont * LINE;
    page.circle(MARGIN_X + 4, y + mode.bulletPad + lineHeight / 2, 2.5, C.orange);
    page.text(lines, MARGIN_X + BULLET_INDENT, y + mode.bulletPad, { size: mode.bulletFont, color: C.text2 });
    y += lines.length * lineHeight + mode.bulletPad * 2;
  });

  if (!blocks.observations) return;
  y += 14;
  page.rect(MARGIN_X, y, width, blocks.observationsHeight, C.obsBg, 10);
  page.text('OBSERVACIONES', MARGIN_X + mode.obsPadX, y + mode.obsPadT, { size: 11, bold: true, color: C.orangeDark });
  page.text(blocks.observationLines, MARGIN_X + mode.obsPadX, y + mode.obsPadT + 18, { size: mode.bulletFont, bold: true, color: C.navy });
}

function drawTotals(page: Page, mode: Mode, blocks: Blocks, total: number, top: number): void {
  const x = RIGHT - mode.totW;
  const radius = 12;
  const rowsH = blocks.totalRows.length * mode.totRowH;
  const barTop = top + rowsH;
  page.rect(x, top, mode.totW, blocks.totalsHeight, C.white, radius);
  // Same trick as the table header: round the whole bar, then cover its upper corners.
  page.rect(x, barTop - radius, mode.totW, mode.barH + radius, C.navy, radius);
  page.rect(x, barTop - radius, mode.totW, radius, C.white);

  const size = mode.id === 'normal' ? 14 : 13;
  blocks.totalRows.forEach((row, index) => {
    const rowTop = top + index * mode.totRowH;
    const discount = row.tone === 'discount';
    page.middle(row.label, x + 20, rowTop, mode.totRowH, { size, color: C.text2 });
    page.middle(row.value, x + mode.totW - 20, rowTop, mode.totRowH, { size, bold: true, color: discount ? C.green : C.navy, align: 'right' });
    if (index < blocks.totalRows.length - 1) page.hline(x + 20, x + mode.totW - 20, rowTop + mode.totRowH, C.line);
  });
  page.middle('TOTAL', x + 20, barTop, mode.barH, { size: mode.barLabel, font: 'InterXB', color: C.white });
  page.middle(formatMoney(total, 'formal'), x + mode.totW - 20, barTop, mode.barH, { size: mode.barValue, font: 'InterXB', color: C.orangeLight, align: 'right' });
  page.stroke(x, top, mode.totW, blocks.totalsHeight, C.navy, 1.5, radius);
}

function drawAuthorization(page: Page, mode: Mode, blocks: Blocks, blockEnd: number): void {
  const top = blockEnd + mode.authMargin;
  const height = blocks.auth - mode.authMargin;
  page.stroke(MARGIN_X, top, CONTENT_W, height, C.line, 1, 12);
  const x = MARGIN_X + mode.authPadX;
  const titleH = 15 * 1.25;
  page.rect(x, top + mode.authPadT + 1, 3, titleH - 2, C.orange, 1.5);
  page.middle('Autorización del cliente', x + 12, top + mode.authPadT, titleH, { size: 15, bold: true, color: C.navy });
  const subTop = top + mode.authPadT + titleH + 4;
  page.text('Acepto los trabajos y condiciones descritos en esta cotización.', x, subTop, { size: mode.bulletFont, color: C.muted });

  const signTop = subTop + mode.bulletFont * 1.4 + mode.signGap;
  const labelSize = 13;
  const nameLabel = 'Nombre y firma:';
  const nameW = page.width(nameLabel, { size: labelSize, bold: true });
  page.text(nameLabel, x, signTop, { size: labelSize, bold: true, color: C.navy });
  const lineY = signTop + labelSize * 1.4 - 2;
  const nameEnd = MARGIN_X + CONTENT_W * 0.58;
  page.hline(x + nameW + 8, nameEnd, lineY, C.sep, 1.2);

  const dateX = nameEnd + 32;
  page.text('Fecha:', dateX, signTop, { size: labelSize, bold: true, color: C.navy });
  const dateW = page.width('Fecha:', { size: labelSize, bold: true });
  page.hline(dateX + dateW + 8, RIGHT - mode.authPadX, lineY, C.sep, 1.2);
}

function drawFooter(page: Page, mode: Mode, blocks: Blocks, sheetNumber: number, sheets: number, business: BusinessInfo): void {
  const top = PAGE_H - BAND_BOTTOM - blocks.footer;
  const lineY = top + mode.footPadT;
  page.hline(MARGIN_X, RIGHT, lineY, C.sep);

  const rowTop = lineY + 12;
  const rowH = 2 * 13 * 1.4;
  const infoSize = 13;
  const iconSize = 18;
  const address = addressLines(business.direccion);
  const phone = business.telefonos[0];
  const measure = (text: string | undefined) => (text ? page.width(text, { size: infoSize }) : 0);
  const layout = layoutFooterContacts({
    addressWidth: Math.max(0, ...address.map((line) => measure(line))),
    phoneWidth: measure(phone),
    emailWidth: measure(business.correo),
  });
  const size = infoSize * layout.scale;
  const iconY = rowTop + (rowH - iconSize) / 2;
  page.icon('pin', MARGIN_X, iconY, iconSize, C.orange);
  page.text(address, MARGIN_X + FOOTER_ICON_OFFSET, rowTop, { size, color: C.text2 });
  if (layout.mode === 'row') {
    if (phone && layout.phoneX !== undefined) {
      page.icon('phone', layout.phoneX, iconY, iconSize, C.orange);
      page.middle(phone, layout.phoneX + FOOTER_ICON_OFFSET, rowTop, rowH, { size, color: C.text2 });
    }
    if (business.correo) {
      const emailW = page.width(business.correo, { size });
      page.icon('mail', RIGHT - emailW - FOOTER_ICON_OFFSET, iconY, iconSize, C.orange);
      page.middle(business.correo, RIGHT, rowTop, rowH, { size, color: C.text2, align: 'right' });
    }
  } else {
    // The phone does not fit beside the address and the email: it goes on the line below the email, right-aligned.
    const lineH = rowH / 2;
    const small = iconSize * 0.8;
    const lines: ['mail' | 'phone', string | undefined][] = [['mail', business.correo], ['phone', phone]];
    lines.forEach(([icon, text], index) => {
      if (!text) return;
      const top = rowTop + index * lineH;
      page.icon(icon, RIGHT - page.width(text, { size }) - FOOTER_ICON_OFFSET, top + (lineH - small) / 2, small, C.orange);
      page.middle(text, RIGHT, top, lineH, { size, color: C.text2, align: 'right' });
    });
  }

  const noteTop = rowTop + rowH + mode.noteT;
  const note = { size: 12, color: C.muted } as const;
  page.text(`Gracias por confiar en ${business.nombre === DEFAULT_BUSINESS_INFO.nombre ? 'JC Motors' : business.nombre}.`, MARGIN_X, noteTop, note);
  let noteRight = RIGHT;
  if (sheets > 1) {
    const label = `Hoja ${sheetNumber} de ${sheets}`;
    page.text(label, RIGHT, noteTop, { size: 12, bold: true, color: C.navy, align: 'right' });
    noteRight -= page.width(label, { size: 12, bold: true }) + 20;
  }
  page.text('Esta cotización no es un comprobante fiscal.', noteRight, noteTop, { ...note, align: 'right' });
}
