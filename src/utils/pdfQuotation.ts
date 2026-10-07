import { jsPDF } from 'jspdf';
import type { PublicQuotation, QuotationItemType } from '../models/quotation';

const PAGE_WIDTH = 210;
const MARGIN = 7;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = 270;

const BUSINESS_CONTACT = {
  addressLines: ['Av. Río Ometepec #1136,', 'Col. Morelos, Culiacán, Sin.'],
  phone: '(667) 351-8806',
  email: 'JCMOTORSCLN@gmail.com',
} as const;

const COLORS = {
  navy: '#102b4c',
  dark: '#081f45',
  text: '#112454',
  orange: '#ff6b00',
  line: '#d7e0e9',
  card: '#f3f7fa',
  band: '#f8fafc',
  bluePill: '#e1efff',
  orangePill: '#ffe9df',
} as const;

// Tipo, concepto, cantidad, precio unitario e importe.
const COLUMN_WIDTHS = [29, 76, 20, 36, 35] as const;
const COLUMN_X = [MARGIN, 36, 112, 132, 168, PAGE_WIDTH - MARGIN] as const;
const ROW_LINE_HEIGHT = 4.35;

export interface QuotationLogo {
  header: string;
  watermark: string;
}

interface CardRow {
  icon: IconName;
  label: string;
  value: string;
}

type IconName = 'person' | 'phone' | 'mail' | 'car' | 'calendar' | 'plate' | 'pin';

const money = (amount: number): string => `$${new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(amount)}`;

const fullDate = (value: string): string => new Intl.DateTimeFormat('es-MX', {
  day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date(value));

export function buildQuotationPdf(quotation: PublicQuotation, logo?: QuotationLogo): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const context = new PdfContext(doc, quotation, logo);
  drawMainHeader(context);
  drawInfoCards(context);
  drawItems(context);
  drawNotesAndTotals(context);
  drawAuthorization(context);
  stampFooters(doc);
  return doc;
}

class PdfContext {
  y = MARGIN;

  constructor(
    readonly doc: jsPDF,
    readonly quotation: PublicQuotation,
    readonly logo?: QuotationLogo,
  ) {
    drawPageBackground(doc, logo);
  }

  nextPage(): void {
    this.doc.addPage();
    drawPageBackground(this.doc, this.logo);
    this.y = 15;
    drawContinuationHeader(this);
  }

  ensureSpace(height: number): boolean {
    if (this.y + height <= CONTENT_BOTTOM) return false;
    this.nextPage();
    return true;
  }
}

function drawPageBackground(doc: jsPDF, logo?: QuotationLogo): void {
  doc.setFillColor(COLORS.orange);
  doc.rect(MARGIN, 6.5, CONTENT_WIDTH, 1.35, 'F');
  if (logo) {
    try {
      // La versión PNG ya tiene la transparencia aplicada y queda detrás de todo el texto.
      doc.addImage(logo.watermark, 'PNG', 58, 100, 94, 94);
    } catch {
      // El contenido de la cotización sigue disponible sin la marca de agua.
    }
  }
}

function drawMainHeader(context: PdfContext): void {
  const { doc, quotation, logo } = context;
  if (logo) {
    try {
      doc.addImage(logo.header, 'PNG', 9, 14, 25, 25);
    } catch {
      // El encabezado mantiene el nombre del negocio aunque falle el logo.
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.setTextColor(COLORS.dark);
  doc.text(quotation.businessName.toUpperCase(), 36, 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(COLORS.text);
  doc.text('Servicio y mantenimiento automotriz', 36, 34);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(COLORS.dark);
  doc.text('COTIZACIÓN', PAGE_WIDTH - MARGIN, 25, { align: 'right' });

  const folio = `Folio:  ${quotation.folio}`;
  doc.setFontSize(9.5);
  const badgeWidth = Math.max(51, Math.min(70, doc.getTextWidth(folio) + 13));
  const badgeX = PAGE_WIDTH - MARGIN - badgeWidth;
  doc.setFillColor(COLORS.navy);
  doc.roundedRect(badgeX, 28, badgeWidth, 8, 1.4, 1.4, 'F');
  doc.setTextColor('#ffffff');
  doc.text(folio, badgeX + badgeWidth / 2, 33.4, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.1);
  doc.setTextColor(COLORS.text);
  doc.text(`Fecha de emisión: ${fullDate(quotation.createdAt)}`, PAGE_WIDTH - MARGIN, 42, { align: 'right' });
  doc.setDrawColor(COLORS.line);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, 46, PAGE_WIDTH - MARGIN, 46);
  context.y = 50;
}

function drawContinuationHeader(context: PdfContext): void {
  const { doc, quotation } = context;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(COLORS.dark);
  doc.text(quotation.businessName.toUpperCase(), MARGIN, context.y + 5);
  doc.setFontSize(12);
  doc.text('COTIZACIÓN', PAGE_WIDTH - MARGIN, context.y + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(quotation.folio, PAGE_WIDTH - MARGIN, context.y + 11, { align: 'right' });
  doc.setDrawColor(COLORS.line);
  doc.line(MARGIN, context.y + 14, PAGE_WIDTH - MARGIN, context.y + 14);
  context.y += 20;
}

function drawInfoCards(context: PdfContext): void {
  const { doc, quotation } = context;
  const cardWidth = (CONTENT_WIDTH - 3) / 2;
  const customerRows: CardRow[] = [
    { icon: 'person', label: 'Nombre:', value: quotation.customer.name },
    { icon: 'phone', label: 'Teléfono:', value: quotation.customer.phone || '—' },
    { icon: 'mail', label: 'Correo:', value: quotation.customer.email || '—' },
  ];
  const vehicleRows: CardRow[] = [
    { icon: 'car', label: 'Marca y modelo:', value: [quotation.vehicle.make, quotation.vehicle.model].filter(Boolean).join(' ') },
    { icon: 'calendar', label: 'Año:', value: quotation.vehicle.year ? String(quotation.vehicle.year) : '—' },
    { icon: 'plate', label: 'Placas:', value: quotation.vehicle.plates || '—' },
  ];
  const leftHeights = measureCardRows(doc, customerRows, cardWidth, 39);
  const rightHeights = measureCardRows(doc, vehicleRows, cardWidth, 45);
  const cardHeight = Math.max(43, 18 + Math.max(sum(leftHeights), sum(rightHeights)) + 3);
  drawInfoCard(doc, MARGIN, context.y, cardWidth, cardHeight, 'DATOS DEL CLIENTE', 'person', customerRows, leftHeights, 39);
  drawInfoCard(doc, MARGIN + cardWidth + 3, context.y, cardWidth, cardHeight, 'DATOS DEL VEHÍCULO', 'car', vehicleRows, rightHeights, 45);
  context.y += cardHeight + 6;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function measureCardRows(doc: jsPDF, rows: CardRow[], width: number, valueOffset: number): number[] {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.1);
  return rows.map((row) => {
    const lines = doc.splitTextToSize(row.value, width - valueOffset - 2) as string[];
    return Math.max(7.9, lines.length * 4.2 + 1);
  });
}

function drawInfoCard(
  doc: jsPDF, x: number, y: number, width: number, height: number,
  title: string, icon: IconName, rows: CardRow[], rowHeights: number[], valueOffset: number,
): void {
  doc.setFillColor(COLORS.card);
  doc.roundedRect(x, y, width, height, 2, 2, 'F');
  doc.setFillColor(COLORS.orange);
  doc.roundedRect(x + 3, y + 3, 9, 9, 1.5, 1.5, 'F');
  drawIcon(doc, icon, x + 5, y + 4.4, 5, '#ffffff');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(COLORS.dark);
  doc.text(title, x + 16, y + 9.3);

  let rowY = y + 18;
  rows.forEach((row, index) => {
    drawIcon(doc, row.icon, x + 5, rowY - 3.5, 5, COLORS.text);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.9);
    doc.setTextColor(COLORS.text);
    doc.text(row.label, x + 16, rowY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.1);
    const lines = doc.splitTextToSize(row.value, width - valueOffset - 2) as string[];
    doc.text(lines, x + valueOffset, rowY);
    rowY += rowHeights[index];
  });
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): void {
  doc.setFillColor(COLORS.orange);
  doc.roundedRect(MARGIN, y + 0.5, 1.4, 7.5, 0.65, 0.65, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(COLORS.dark);
  doc.text(title, MARGIN + 4.5, y + 6.5);
}

function drawItems(context: PdfContext): void {
  drawSectionTitle(context.doc, 'SERVICIOS Y REFACCIONES', context.y);
  context.y += 11;
  drawItemsHeader(context);

  context.quotation.items.forEach((item, index) => {
    const { doc } = context;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    const lines = (doc.splitTextToSize(item.description || '—', COLUMN_WIDTHS[1] - 9) as string[]);
    let offset = 0;
    let first = true;
    while (offset < lines.length) {
      if (context.y + 12 > CONTENT_BOTTOM) continueItemsOnNextPage(context);
      const maxLines = Math.max(1, Math.floor((CONTENT_BOTTOM - context.y - 4) / ROW_LINE_HEIGHT));
      const chunk = lines.slice(offset, offset + maxLines);
      const rowHeight = Math.max(12, chunk.length * ROW_LINE_HEIGHT + 4);
      if (context.y + rowHeight > CONTENT_BOTTOM) {
        continueItemsOnNextPage(context);
        continue;
      }
      drawItemRow(context, item.type, chunk, item.quantity, item.saleUnitPrice, item.amount, index, rowHeight, first);
      offset += chunk.length;
      first = false;
    }
  });
  context.y += 6;
}

function continueItemsOnNextPage(context: PdfContext): void {
  context.nextPage();
  drawSectionTitle(context.doc, 'SERVICIOS Y REFACCIONES', context.y);
  context.y += 11;
  drawItemsHeader(context);
}

function drawItemsHeader(context: PdfContext): void {
  const { doc } = context;
  const y = context.y;
  doc.setFillColor(COLORS.navy);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 10.5, 1.4, 1.4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.7);
  doc.setTextColor('#ffffff');
  doc.text('TIPO', COLUMN_X[0] + 5, y + 6.8);
  doc.text('CONCEPTO', COLUMN_X[1] + 5, y + 6.8);
  doc.text('CANT.', COLUMN_X[3] - 4, y + 6.8, { align: 'right' });
  doc.text('PRECIO UNITARIO', COLUMN_X[4] - 4, y + 6.8, { align: 'right' });
  doc.text('IMPORTE', COLUMN_X[5] - 4, y + 6.8, { align: 'right' });
  context.y += 10.5;
}

function drawItemRow(
  context: PdfContext, type: QuotationItemType, lines: string[], quantity: number,
  unitPrice: number, amount: number, index: number, height: number, first: boolean,
): void {
  const { doc } = context;
  const y = context.y;
  if (index % 2 === 1) {
    doc.setFillColor(COLORS.band);
    doc.rect(MARGIN, y, CONTENT_WIDTH, height, 'F');
  }
  doc.setDrawColor(COLORS.line);
  doc.setLineWidth(0.2);
  for (const x of COLUMN_X) doc.line(x, y, x, y + height);
  doc.line(MARGIN, y + height, PAGE_WIDTH - MARGIN, y + height);

  if (first) {
    const isLabor = type === 'labor';
    doc.setFillColor(isLabor ? COLORS.bluePill : COLORS.orangePill);
    doc.roundedRect(MARGIN + 3, y + 3.2, 23, 6.5, 3, 3, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(isLabor ? '#1561c6' : '#ed4e23');
    doc.text(isLabor ? 'Servicio' : 'Refacción', MARGIN + 14.5, y + 7.5, { align: 'center' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(COLORS.text);
  doc.text(lines, COLUMN_X[1] + 5, y + 7);
  if (first) {
    doc.text(String(quantity), COLUMN_X[3] - 10, y + 7, { align: 'center' });
    doc.text(money(unitPrice), COLUMN_X[4] - 5, y + 7, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(money(amount), COLUMN_X[5] - 4, y + 7, { align: 'right' });
  }
  context.y += height;
}

function conditionsFor(quotation: PublicQuotation): string[] {
  return [
    `Cotización válida durante ${quotation.validityDays} días.`,
    'Precios sujetos a revisión y disponibilidad de refacciones.',
    'Cualquier trabajo adicional requiere autorización del cliente.',
    'Garantía aplicable según el servicio o refacción.',
    ...(!quotation.includeVat ? ['Precios sin IVA; se agregará al solicitar factura.'] : []),
    ...[quotation.customerNotes, quotation.publicNotes]
      .filter((note): note is string => Boolean(note?.trim()))
      .map((note) => note.trim()),
  ];
}

function totalRowsFor(quotation: PublicQuotation): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Refacciones', money(quotation.subtotalRefacciones)],
    ['Mano de obra', money(quotation.subtotalManoObra)],
  ];
  if (quotation.laborDiscount > 0) {
    rows.push(['Descuento M.O.', `- ${money(quotation.laborDiscount)}`]);
  }
  rows.push(['Subtotal', money(quotation.subtotalNeto)]);
  rows.push([quotation.includeVat ? 'IVA (16%)' : 'IVA no incluido', money(quotation.ivaAmount)]);
  return rows;
}

function drawNotesAndTotals(context: PdfContext): void {
  const { doc, quotation } = context;
  const conditions = conditionsFor(quotation);
  const rows = totalRowsFor(quotation);
  const noteWidth = 105;
  const totalX = MARGIN + noteWidth + 5;
  const totalWidth = PAGE_WIDTH - MARGIN - totalX;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  const wrapped = conditions.map((condition) => doc.splitTextToSize(condition, noteWidth - 15) as string[]);
  const noteCardHeight = Math.max(35, 7 + sum(wrapped.map((lines) => lines.length * 4.2 + 2)));
  const totalHeight = rows.length * 7 + 12;
  const sectionHeight = Math.max(9 + noteCardHeight, totalHeight);

  if (sectionHeight > 225) {
    drawLongNotes(context, conditions);
    context.ensureSpace(totalHeight + 6);
    drawTotalsBox(doc, totalX, context.y, totalWidth, rows, quotation.total);
    context.y += totalHeight + 6;
    return;
  }

  context.ensureSpace(sectionHeight + 4);
  const top = context.y;
  drawSectionTitle(doc, 'NOTAS Y CONDICIONES', top);
  drawNoteCard(doc, MARGIN, top + 9, noteWidth, noteCardHeight, wrapped);
  drawTotalsBox(doc, totalX, top, totalWidth, rows, quotation.total);
  context.y += sectionHeight + 5;
}

function drawNoteCard(doc: jsPDF, x: number, y: number, width: number, height: number, linesByNote: string[][]): void {
  doc.setFillColor(COLORS.card);
  doc.roundedRect(x, y, width, height, 2, 2, 'F');
  let lineY = y + 7;
  for (const lines of linesByNote) {
    doc.setFillColor(COLORS.orange);
    doc.circle(x + 6, lineY - 0.8, 0.85, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(COLORS.text);
    doc.text(lines, x + 11, lineY);
    lineY += lines.length * 4.2 + 2;
  }
}

function drawLongNotes(context: PdfContext, conditions: string[]): void {
  const { doc } = context;
  context.ensureSpace(19);
  drawSectionTitle(doc, 'NOTAS Y CONDICIONES', context.y);
  context.y += 13;
  for (const condition of conditions) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    const lines = doc.splitTextToSize(condition, CONTENT_WIDTH - 15) as string[];
    for (let index = 0; index < lines.length; index += 1) {
      if (context.ensureSpace(5)) {
        drawSectionTitle(doc, 'NOTAS Y CONDICIONES', context.y);
        context.y += 13;
      }
      if (index === 0) {
        doc.setFillColor(COLORS.orange);
        doc.circle(MARGIN + 5, context.y - 0.8, 0.85, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(COLORS.text);
      doc.text(lines[index], MARGIN + 11, context.y);
      context.y += 4.4;
    }
    context.y += 2;
  }
  context.y += 5;
}

function drawTotalsBox(
  doc: jsPDF, x: number, y: number, width: number,
  rows: Array<[string, string]>, total: number,
): void {
  const rowHeight = 7;
  const totalHeight = 12;
  const height = rows.length * rowHeight + totalHeight;
  doc.setDrawColor(COLORS.navy);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, width, height, 1.8, 1.8, 'S');
  rows.forEach(([label, value], index) => {
    const baseline = y + 5 + index * rowHeight;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(COLORS.text);
    doc.text(label, x + 5, baseline);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.7);
    doc.text(value, x + width - 4, baseline, { align: 'right' });
    if (index < rows.length - 1) {
      doc.setDrawColor(COLORS.line);
      doc.line(x + 5, y + (index + 1) * rowHeight, x + width - 4, y + (index + 1) * rowHeight);
    }
  });
  const totalY = y + rows.length * rowHeight;
  doc.setFillColor(COLORS.navy);
  doc.rect(x, totalY, width, totalHeight, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor('#ffffff');
  doc.text('TOTAL', x + 5, totalY + 8);
  doc.setFontSize(11.5);
  doc.setTextColor(COLORS.orange);
  doc.text(`MXN ${money(total)}`, x + width - 4, totalY + 8, { align: 'right' });
}

function drawAuthorization(context: PdfContext): void {
  context.ensureSpace(31);
  const { doc } = context;
  const y = context.y;
  doc.setDrawColor(COLORS.line);
  doc.setLineWidth(0.35);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 29, 1.8, 1.8, 'S');
  doc.setFillColor(COLORS.orange);
  doc.roundedRect(MARGIN + 2.5, y + 3.5, 1.4, 7, 0.6, 0.6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(COLORS.dark);
  doc.text('Autorización del cliente', MARGIN + 6.5, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(COLORS.text);
  doc.text('Acepto los trabajos y condiciones descritos en esta cotización.', MARGIN + 6.5, y + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Nombre y firma:', MARGIN + 6.5, y + 24);
  doc.text('Fecha:', 149, y + 24);
  doc.setDrawColor('#8096ba');
  doc.setLineWidth(0.25);
  doc.line(41, y + 24.5, 136, y + 24.5);
  doc.line(162, y + 24.5, PAGE_WIDTH - MARGIN - 6, y + 24.5);
  context.y += 34;
}

function stampFooters(doc: jsPDF): void {
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(COLORS.line);
    doc.setLineWidth(0.35);
    doc.line(MARGIN, 274, PAGE_WIDTH - MARGIN, 274);
    drawIcon(doc, 'pin', 13, 279, 6, COLORS.orange);
    drawIcon(doc, 'phone', 89, 279, 6, COLORS.orange);
    drawIcon(doc, 'mail', 144, 279, 6, COLORS.orange);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(COLORS.text);
    doc.text(BUSINESS_CONTACT.addressLines[0], 24, 281.5);
    doc.text(BUSINESS_CONTACT.addressLines[1], 24, 286);
    doc.text(BUSINESS_CONTACT.phone, 99, 283);
    doc.text(BUSINESS_CONTACT.email, 153, 283);
    doc.setFontSize(7.4);
    doc.setTextColor('#66789c');
    doc.text('Gracias por confiar en JC Motors.', MARGIN, 294);
    doc.text(`Página ${page} de ${totalPages}`, PAGE_WIDTH - MARGIN, 294, { align: 'right' });
  }
}

function drawIcon(doc: jsPDF, name: IconName, x: number, y: number, size: number, color: string): void {
  doc.setDrawColor(color);
  doc.setLineWidth(0.42);
  const cx = x + size / 2;
  switch (name) {
    case 'person':
      doc.circle(cx, y + size * 0.28, size * 0.16, 'S');
      doc.roundedRect(x + size * 0.16, y + size * 0.53, size * 0.68, size * 0.37, 0.8, 0.8, 'S');
      break;
    case 'car':
      doc.line(x + size * 0.2, y + size * 0.43, x + size * 0.34, y + size * 0.2);
      doc.line(x + size * 0.34, y + size * 0.2, x + size * 0.7, y + size * 0.2);
      doc.line(x + size * 0.7, y + size * 0.2, x + size * 0.84, y + size * 0.43);
      doc.roundedRect(x + size * 0.12, y + size * 0.42, size * 0.76, size * 0.38, 0.7, 0.7, 'S');
      doc.circle(x + size * 0.28, y + size * 0.81, size * 0.07, 'S');
      doc.circle(x + size * 0.72, y + size * 0.81, size * 0.07, 'S');
      break;
    case 'phone':
      doc.line(x + size * 0.2, y + size * 0.12, x + size * 0.36, y + size * 0.29);
      doc.line(x + size * 0.36, y + size * 0.29, x + size * 0.28, y + size * 0.43);
      doc.line(x + size * 0.28, y + size * 0.43, x + size * 0.61, y + size * 0.76);
      doc.line(x + size * 0.61, y + size * 0.76, x + size * 0.75, y + size * 0.65);
      doc.line(x + size * 0.75, y + size * 0.65, x + size * 0.91, y + size * 0.82);
      doc.line(x + size * 0.91, y + size * 0.82, x + size * 0.77, y + size * 0.94);
      break;
    case 'mail':
      doc.roundedRect(x + size * 0.08, y + size * 0.19, size * 0.84, size * 0.62, 0.5, 0.5, 'S');
      doc.line(x + size * 0.08, y + size * 0.25, cx, y + size * 0.57);
      doc.line(cx, y + size * 0.57, x + size * 0.92, y + size * 0.25);
      break;
    case 'calendar':
      doc.roundedRect(x + size * 0.14, y + size * 0.18, size * 0.72, size * 0.7, 0.5, 0.5, 'S');
      doc.line(x + size * 0.14, y + size * 0.38, x + size * 0.86, y + size * 0.38);
      doc.line(x + size * 0.33, y + size * 0.08, x + size * 0.33, y + size * 0.27);
      doc.line(x + size * 0.67, y + size * 0.08, x + size * 0.67, y + size * 0.27);
      break;
    case 'plate':
      doc.roundedRect(x + size * 0.08, y + size * 0.25, size * 0.84, size * 0.52, 0.6, 0.6, 'S');
      doc.line(x + size * 0.25, y + size * 0.5, x + size * 0.42, y + size * 0.5);
      doc.line(x + size * 0.59, y + size * 0.5, x + size * 0.76, y + size * 0.5);
      break;
    case 'pin':
      doc.circle(cx, y + size * 0.36, size * 0.28, 'S');
      doc.circle(cx, y + size * 0.36, size * 0.08, 'S');
      doc.line(x + size * 0.28, y + size * 0.53, cx, y + size * 0.95);
      doc.line(cx, y + size * 0.95, x + size * 0.72, y + size * 0.53);
      break;
  }
}

let logoPromise: Promise<QuotationLogo | undefined> | undefined;

/** Usa el logo actual de la app para el encabezado y una copia tenue de marca de agua. */
export function loadLogoDataUrl(): Promise<QuotationLogo | undefined> {
  logoPromise ??= fetch('/jc-motors-logo.png')
    .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error('Logo no disponible')))
    .then(createLogoImages)
    .catch(() => undefined);
  return logoPromise;
}

function createLogoImages(buffer: ArrayBuffer): Promise<QuotationLogo> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(new Blob([buffer], { type: 'image/png' }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const header = document.createElement('canvas');
      header.width = 220;
      header.height = 220;
      const watermark = document.createElement('canvas');
      watermark.width = 320;
      watermark.height = 320;
      const headerContext = header.getContext('2d');
      const watermarkContext = watermark.getContext('2d');
      if (!headerContext || !watermarkContext) {
        reject(new Error('Canvas no disponible'));
        return;
      }
      headerContext.drawImage(image, 0, 0, 220, 220);
      watermarkContext.globalAlpha = 0.045;
      watermarkContext.drawImage(image, 0, 0, 320, 320);
      resolve({ header: header.toDataURL('image/png'), watermark: watermark.toDataURL('image/png') });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo decodificar el logo'));
    };
    image.src = objectUrl;
  });
}
