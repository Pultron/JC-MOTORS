import type { jsPDF } from 'jspdf';

export interface PdfAssets {
  regular: string;
  bold: string;
  extraBold: string;
  /** PNG data URL; the PDF still renders without it. */
  logo?: string;
}

/** Static TTFs only: jsPDF does not support variable fonts. */
export function registerFonts(doc: jsPDF, assets: PdfAssets): void {
  doc.addFileToVFS('Inter-Regular.ttf', assets.regular);
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
  doc.addFileToVFS('Inter-Bold.ttf', assets.bold);
  doc.addFont('Inter-Bold.ttf', 'Inter', 'bold');
  doc.addFileToVFS('Inter-ExtraBold.ttf', assets.extraBold);
  doc.addFont('Inter-ExtraBold.ttf', 'InterXB', 'normal');
}
