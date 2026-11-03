import { useContext } from 'react';
import { ConfirmContext } from '../components/ui/ConfirmDialog';

/** confirm({ title, description, confirmLabel, cancelLabel }) devuelve Promise<boolean>. */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  return confirm;
}
