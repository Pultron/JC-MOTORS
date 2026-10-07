import { useEffect, useRef } from 'react';
import { Button } from './Button';

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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-dialog-title"
      onClose={onClose}
      className="m-auto w-11/12 max-w-lg rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-navy-950/50"
    >
      <div className="p-6">
        <h2 id="confirm-dialog-title" className="text-lg font-bold text-navy-950">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" disabled={isBusy} onClick={onClose}>Cancelar</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} disabled={isBusy} onClick={onConfirm}>{isBusy ? 'Procesando…' : confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}