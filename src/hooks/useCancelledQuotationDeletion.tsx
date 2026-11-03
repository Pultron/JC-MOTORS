import type { Quotation } from '../models/quotation';
import { useToast } from '../components/ui/Toast';
import { useQuotations } from '../store/QuotationContext';
import { useConfirm } from './useConfirm';

export function useCancelledQuotationDeletion() {
  const { deleteCancelledQuotation } = useQuotations();
  const confirm = useConfirm();
  const toast = useToast();

  async function requestDelete(quotation: Quotation) {
    if (quotation.status !== 'Cancelada') return;
    const accepted = await confirm({
      title: '¿Eliminar cotización permanentemente?',
      description: `La cotización ${quotation.folio} y sus datos se eliminarán definitivamente. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar permanentemente',
      tone: 'danger',
    });
    if (!accepted) return;

    try {
      const deleted = await deleteCancelledQuotation(quotation.id);
      if (!deleted) toast.error({ title: 'No se pudo eliminar', description: 'Solo se pueden eliminar cotizaciones que estén canceladas.' });
    } catch {
      toast.error({ title: 'No se pudo eliminar la cotización', description: 'Inténtalo de nuevo.' });
    }
  }

  return { requestDelete: (quotation: Quotation) => void requestDelete(quotation) };
}
