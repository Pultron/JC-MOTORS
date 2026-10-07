import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Quotation } from '../models/quotation';
import { useQuotations } from '../store/QuotationContext';

type PendingActionType = 'approve' | 'cancel';

interface PendingAction {
  type: PendingActionType;
  quotation: Quotation;
}

export interface QuotationActionController {
  requestApprove: (quotation: Quotation) => void;
  requestCancel: (quotation: Quotation) => void;
  confirmDialog: ReactElement;
}

/**
 * Aprobar y cancelar son estados terminales: nunca se aplican sin confirmación y el texto
 * de la advertencia vive aquí para que no difiera entre Inicio, Historial y el detalle.
 */
export function useQuotationActions(onUpdated?: (quotation: Quotation) => void): QuotationActionController {
  const { approveQuotation, cancelQuotation } = useQuotations();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const request = useCallback((type: PendingActionType) => (quotation: Quotation) => {
    setError('');
    setPending({ type, quotation });
  }, []);

  async function handleConfirm() {
    if (!pending) return;
    setError('');
    setIsBusy(true);
    try {
      const updated = pending.type === 'approve'
        ? await approveQuotation(pending.quotation.id)
        : await cancelQuotation(pending.quotation.id);

      if (!updated) {
        setError(pending.type === 'approve'
          ? 'Esta cotización ya no está pendiente, no se puede aprobar.'
          : 'Solo se pueden cancelar cotizaciones que siguen pendientes.');
        return;
      }

      onUpdated?.(updated);
      setPending(null);
    } catch {
      setError('No se pudo completar la operación. Inténtalo de nuevo.');
    } finally {
      setIsBusy(false);
    }
  }

  const isApprove = pending?.type === 'approve';

  const confirmDialog = (
    <ConfirmDialog
      isOpen={pending !== null}
      title={isApprove ? '¿Aprobar esta cotización?' : '¿Cancelar esta cotización?'}
      description={isApprove
        ? 'Al aprobarla se enviará al apartado de Control interno y ya no podrán modificarse los datos enviados al cliente.'
        : `La cotización ${pending?.quotation.folio ?? ''} dejará de estar disponible para el cliente. Esta acción no se puede deshacer.`}
      confirmLabel={isApprove ? 'Aprobar cotización' : 'Cancelar cotización'}
      tone={isApprove ? 'primary' : 'danger'}
      isBusy={isBusy}
      error={error}
      onConfirm={() => void handleConfirm()}
      onClose={() => setPending(null)}
    />
  );

  return {
    requestApprove: request('approve'),
    requestCancel: request('cancel'),
    confirmDialog,
  };
}