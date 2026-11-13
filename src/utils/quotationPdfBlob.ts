import type { Quotation } from '../models/quotation';
import { toPublicQuotation } from './quotation';

/**
 * The single place where a customer-facing quotation PDF is produced, so a downloaded PDF and a PDF handed
 * to WhatsApp/email come out of exactly the same generator. Never includes internal costs (public allowlist).
 */
export async function generateQuotationPdfBlob(quotation: Quotation, toast?: { warning: (input: { title: string }) => void }): Promise<Blob> {
  // jsPDF pesa ~160 kB: se carga sólo cuando el usuario pide un PDF.
  const [{ buildQuotationPdf }, { loadPdfAssets, warnIfLogoMissing }] = await Promise.all([import('./pdfQuotation'), import('./pdfAssetsLoader')]);
  const assets = await loadPdfAssets();
  if (toast) warnIfLogoMissing(assets, toast);
  return buildQuotationPdf(toPublicQuotation(quotation), assets).output('blob');
}
