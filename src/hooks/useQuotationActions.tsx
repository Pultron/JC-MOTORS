import type { Quotation } from '../models/quotation';
import { useToast } from '../components/ui/Toast';
import { useQuotations } from '../store/QuotationContext';
import { useConfirm } from './useConfirm';

export interface QuotationActionController {
  requestApprove: (quotation: Quotation) => void;
  requestCancel: (quotation: Quotation) => void;
}

/**
 * Aprobar y cancelar son estados terminales: nunca se aplican sin confirmación y el texto
 * de la advertencia vive aquí para que no difiera entre Inicio, Historial y el detalle.
 * La operación corre hasta que termina la animación de salida del diálogo.
 */
export function useQuotationActions(onUpdated?: (quotation: Quotation) => void): QuotationActionController {
  const { approveQuotation, cancelQuotation } = useQuotations();
  const confirm = useConfirm();
  const toast = useToast();

  async function run(type: 'approve' | 'cancel', quotation: Quotation) {
    const isApprove = type === 'approve';
    const accepted = await confirm(isApprove
      ? {
        title: '¿Aprobar esta cotización?',
        description: 'Al aprobarla se enviará al apartado de Control interno y ya no podrán modificarse los datos enviados al cliente.',
        confirmLabel: 'Aprobar cotización',
      }
      : {
        title: '¿Cancelar esta cotización?',
        description: `La cotización ${quotation.folio} dejará de estar disponible para el cliente. Esta acción no se puede deshacer.`,
        confirmLabel: 'Cancelar cotización',
        tone: 'danger',
      });
    if (!accepted) return;

    try {
      const updated = isApprove ? await approveQuotation(quotation.id) : await cancelQuotation(quotation.id);
      if (!updated) {
        toast.error({
          title: isApprove ? 'No se pudo aprobar' : 'No se pudo cancelar',
          description: isApprove
            ? 'Esta cotización ya no está pendiente, no se puede aprobar.'
            : 'Solo se pueden cancelar cotizaciones que siguen pendientes.',
        });
        return;
      }
      onUpdated?.(updated);
    } catch {
      toast.error({ title: 'No se pudo completar la operación', description: 'Inténtalo de nuevo.' });
    }
  }

  return {
    requestApprove: (quotation) => void run('approve', quotation),
    requestCancel: (quotation) => void run('cancel', quotation),
  };
}
