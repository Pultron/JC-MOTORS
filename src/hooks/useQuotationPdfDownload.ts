import { useToast } from '../components/ui/Toast';
import type { Quotation } from '../models/quotation';
import { generateQuotationPdfBlob } from '../utils/quotationPdfBlob';
import { savePdfFile } from '../utils/savePdfFile';
import { userMessage } from '../utils/userMessage';

/** Genera y guarda el PDF público (sin costos internos) directamente, sin abrir la vista previa. */
export function useQuotationPdfDownload() {
  const toast = useToast();

  async function download(quotation: Quotation) {
    try {
      const blob = await generateQuotationPdfBlob(quotation, toast);
      const file = new File([blob], `${quotation.folio}.pdf`, { type: 'application/pdf' });
      const path = await savePdfFile(file, quotation.folio);
      if (path) toast.success({ title: 'PDF guardado', description: `PDF guardado en ${path}` });
    } catch (cause) {
      toast.error({ title: 'No se pudo guardar el PDF', description: userMessage(cause, 'pdf-guardar') });
    }
  }

  return (quotation: Quotation) => void download(quotation);
}
