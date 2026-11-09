import { useToast } from '../components/ui/Toast';
import type { Quotation } from '../models/quotation';
import { toPublicQuotation } from '../utils/quotation';
import { savePdfFile } from '../utils/savePdfFile';

/** Genera y guarda el PDF público (sin costos internos) directamente, sin abrir la vista previa. */
export function useQuotationPdfDownload() {
  const toast = useToast();

  async function download(quotation: Quotation) {
    try {
      // jsPDF pesa ~160 kB: se carga sólo cuando el usuario pide un PDF.
      const [{ buildQuotationPdf }, { loadPdfAssets }] = await Promise.all([import('../utils/pdfQuotation'), import('../utils/pdfAssetsLoader')]);
      const blob = buildQuotationPdf(toPublicQuotation(quotation), await loadPdfAssets()).output('blob');
      const file = new File([blob], `${quotation.folio}.pdf`, { type: 'application/pdf' });
      const path = await savePdfFile(file, quotation.folio);
      if (path) toast.success({ title: 'PDF guardado', description: `PDF guardado en ${path}` });
    } catch (cause) {
      toast.error({ title: 'No se pudo guardar el PDF', description: `No se pudo guardar el PDF: ${String(cause)}` });
    }
  }

  return (quotation: Quotation) => void download(quotation);
}
