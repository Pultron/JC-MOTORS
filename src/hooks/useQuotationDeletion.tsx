import { isDeletableStatus } from '../models/quotation';
import type { Quotation } from '../models/quotation';
import { useToast } from '../components/ui/Toast';
import { useQuotations } from '../store/QuotationContext';
import { useConfirm } from './useConfirm';

export function useQuotationDeletion() {
  const { deleteQuotationPermanently } = useQuotations();
  const confirm = useConfirm();
  const toast = useToast();

  async function requestDelete(quotation: Quotation) {
    if (!isDeletableStatus(quotation.status)) return;
    const accepted = await confirm({
      title: '¿Eliminar cotización permanentemente?',
      description: `La cotización ${quotation.folio} y sus datos se eliminarán definitivamente. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar permanentemente',
      tone: 'danger',
    });
    if (!accepted) return;

    try {
      const deleted = await deleteQuotationPermanently(quotation.id);
      if (!deleted) toast.error({ title: 'No se pudo eliminar', description: 'Solo se pueden eliminar cotizaciones canceladas o vencidas.' });
    } catch {
      toast.error({ title: 'No se pudo eliminar la cotización', description: 'Inténtalo de nuevo.' });
    }
  }

  return { requestDelete: (quotation: Quotation) => void requestDelete(quotation) };
}
