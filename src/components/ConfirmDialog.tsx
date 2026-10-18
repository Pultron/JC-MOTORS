import { useEffect, useId, useRef } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { Button } from './Button';
import './confirmDialog.css';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  isBusy?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  isBusy = false,
  error = '',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  const Icon = tone === 'danger' ? CircleAlert : CircleCheck;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
      className="confirm-dialog"
    >
      <div className="confirm-dialog-body">
        <button type="button" className="confirm-dialog-close" aria-label="Cerrar confirmación" disabled={isBusy} onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
        <span className="confirm-dialog-icon" aria-hidden="true"><Icon size={28} strokeWidth={2} /></span>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId} className="confirm-dialog-description">{description}</p>
        {error && <p role="alert" className="confirm-dialog-error">{error}</p>}
        <div className="confirm-dialog-actions">
          <Button variant="secondary" disabled={isBusy} onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={isBusy} onClick={onConfirm}>{isBusy ? 'Procesando…' : confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}
