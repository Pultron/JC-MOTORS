import type { Quotation } from '../models/quotation';
import { useToast } from '../components/ui/Toast';
import { useQuotations } from '../store/QuotationContext';
import { MAX_CANCELLATION_REASON } from '../models/quotation';
import { CANCELLATION_REASON_SUGGESTIONS, sharedCancelNote } from '../services/cancellationText';
import { useConfirm, useReasonPrompt } from './useConfirm';

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
  const promptReason = useReasonPrompt();
  const toast = useToast();

  async function run(type: 'approve' | 'cancel', quotation: Quotation) {
    const isApprove = type === 'approve';
    const isApprovedCancel = !isApprove && quotation.status === 'Aprobada';
    let reason: string | undefined;

    if (isApprovedCancel) {
      // An approved quotation counts in Control interno, so cancelling it asks for a mandatory reason.
      const answer = await promptReason({
        title: `¿Cancelar la cotización ${quotation.folio}?`,
        description: 'Saldrá de Control interno y ya no contará en tus ganancias. Después podrás eliminarla si lo necesitas.',
        note: sharedCancelNote(quotation),
        reasonLabel: 'Motivo',
        maxLength: MAX_CANCELLATION_REASON,
        suggestions: CANCELLATION_REASON_SUGGESTIONS,
        confirmLabel: 'Cancelar cotización',
        cancelLabel: 'Mantener aprobada',
        tone: 'danger',
      });
      if (!answer) return;
      reason = answer;
    } else {
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
    }

    try {
      const updated = isApprove ? await approveQuotation(quotation.id) : await cancelQuotation(quotation.id, reason);
      if (!updated) {
        toast.error({
          title: isApprove ? 'No se pudo aprobar' : 'No se pudo cancelar',
          description: isApprove
            ? 'Esta cotización ya no está pendiente, no se puede aprobar.'
            : 'Solo se pueden cancelar cotizaciones pendientes o aprobadas.',
        });
        return;
      }
      onUpdated?.(updated);
    } catch {
      toast.error(isApprovedCancel
        ? { title: 'No se pudo cancelar la cotización', description: 'No se hizo ningún cambio: sigue aprobada. Inténtalo de nuevo.' }
        : { title: 'No se pudo completar la operación', description: 'Inténtalo de nuevo.' });
    }
  }

  return {
    requestApprove: (quotation) => void run('approve', quotation),
    requestCancel: (quotation) => void run('cancel', quotation),
  };
}
