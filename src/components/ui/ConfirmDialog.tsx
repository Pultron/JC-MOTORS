import { createContext, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { AnimationEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

type Phase = 'in' | 'out';

interface ConfirmDialogProps extends ConfirmOptions {
  /** Se llama una sola vez, cuando termina la animación de salida. */
  onResolve: (accepted: boolean) => void;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({ title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'primary', onResolve }: ConfirmDialogProps) {
  const [phase, setPhase] = useState<Phase>('in');
  const phaseRef = useRef<Phase>('in');
  const result = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const finish = useCallback((accepted: boolean) => {
    if (phaseRef.current === 'out') return;
    phaseRef.current = 'out';
    result.current = accepted;
    setPhase('out');
  }, []);

  // Se captura al renderizar: autoFocus mueve el foco al botón antes de que corran los efectos.
  const openerRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);

  useEffect(() => {
    const opener = openerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    confirmRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
        return;
      }
      if (event.key === 'Enter' && !event.repeat) {
        // Sobre Cancelar, Enter activa ese botón; en cualquier otro lugar confirma.
        if ((event.target as HTMLElement).dataset?.testid === 'confirm-cancel') return;
        event.preventDefault();
        finish(true);
        return;
      }
      if (event.key === 'Tab') {
        const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!dialog.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [finish]);

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    // Los eventos de pop, draw y scrim también burbujean hasta aquí.
    if (event.animationName === 'dlgOut') onResolve(result.current);
  }

  const isDanger = tone === 'danger';

  return createPortal(
    <div className="mac-scrim" data-state={phase}>
      <div className="mac-scrim-bg" aria-hidden="true" />
      <button type="button" className="mac-scrim-dismiss" tabIndex={-1} aria-label="Cancelar" onClick={() => finish(false)} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-testid="confirm-dialog"
        className="mac-dialog"
        onAnimationEnd={handleAnimationEnd}
      >
        <span className="mac-dialog-icon" data-tone={tone} aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle className="mac-draw mac-draw-circle" cx="12" cy="12" r="9" pathLength="1" />
            {isDanger
              ? <><path className="mac-draw mac-draw-mark" d="M12 7.5v5" pathLength="1" /><path className="mac-draw mac-draw-mark" d="M12 16.2h.01" pathLength="1" /></>
              : <path className="mac-draw mac-draw-mark" d="M8 12.5l3 3 5-6" pathLength="1" />}
          </svg>
        </span>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId} className="mac-dialog-description">{description}</p>
        <div className="mac-dialog-actions">
          <button type="button" data-testid="confirm-cancel" className="mac-btn mac-btn-secondary" onClick={() => finish(false)}>{cancelLabel}</button>
          <button ref={confirmRef} type="button" data-testid="confirm-accept" className={`mac-btn ${isDanger ? 'mac-btn-danger' : 'mac-btn-primary'}`} autoFocus onClick={() => finish(true)}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface PendingRequest {
  options: ConfirmOptions;
  resolve: (accepted: boolean) => void;
}

/** Monta un único diálogo y expone confirm() como promesa para usarlo con await. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const requestRef = useRef<PendingRequest | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => new Promise<boolean>((resolve) => {
    // Un segundo confirm() mientras hay uno abierto se rechaza para no apilar diálogos.
    if (requestRef.current) {
      resolve(false);
      return;
    }
    requestRef.current = { options, resolve };
    setRequest(requestRef.current);
  }), []);

  const handleResolve = useCallback((accepted: boolean) => {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(accepted);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && <ConfirmDialog {...request.options} onResolve={handleResolve} />}
    </ConfirmContext.Provider>
  );
}
