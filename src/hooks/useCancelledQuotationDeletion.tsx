import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Quotation } from '../models/quotation';
import { useQuotations } from '../store/QuotationContext';

export function useCancelledQuotationDeletion() {
  const { deleteCancelledQuotation } = useQuotations();
  const [pending, setPending] = useState<Quotation | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  function requestDelete(quotation: Quotation) {
    if (quotation.status !== 'Cancelada') return;
    setError('');
    setPending(quotation);
  }

  async function handleConfirm() {
    if (!pending) return;
    setError('');
    setIsBusy(true);
    try {
      const deleted = await deleteCancelledQuotation(pending.id);
      if (!deleted) {
        setError('Solo se pueden eliminar cotizaciones que estén canceladas.');
        return;
      }
      setPending(null);
    } catch {
      setError('No se pudo eliminar la cotización. Inténtalo de nuevo.');
    } finally {
      setIsBusy(false);
    }
  }

  const confirmDialog = (
    <ConfirmDialog
      isOpen={pending !== null}
      title="¿Eliminar cotización permanentemente?"
      description={`La cotización ${pending?.folio ?? ''} y sus datos se eliminarán definitivamente. Esta acción no se puede deshacer.`}
      confirmLabel="Eliminar permanentemente"
      tone="danger"
      isBusy={isBusy}
      error={error}
      onConfirm={() => void handleConfirm()}
      onClose={() => setPending(null)}
    />
  );

  return { requestDelete, confirmDialog };
}
