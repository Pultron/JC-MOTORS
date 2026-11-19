import { useContext } from 'react';
import { ChooseContext, ConfirmContext, ReasonPromptContext } from '../components/ui/ConfirmDialog';

/** confirm({ title, description, confirmLabel, cancelLabel }) devuelve Promise<boolean>. */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  return confirm;
}

/** choose({ title, description, confirmLabel, secondaryLabel, cancelLabel, icon }) devuelve Promise<'primary' | 'secondary' | 'cancel'>. */
export function useChoose() {
  const choose = useContext(ChooseContext);
  if (!choose) throw new Error('useChoose debe usarse dentro de ConfirmProvider');
  return choose;
}

/** promptReason({ ...confirm options, reasonLabel, maxLength, suggestions }) devuelve Promise<string | null> (el motivo, o null si se descarta). */
export function useReasonPrompt() {
  const promptReason = useContext(ReasonPromptContext);
  if (!promptReason) throw new Error('useReasonPrompt debe usarse dentro de ConfirmProvider');
  return promptReason;
}
