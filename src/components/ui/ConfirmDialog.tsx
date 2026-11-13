import { createContext, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { AnimationEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  /** Optional icon drawn in the same box; default is the check (or the alert mark for the danger tone). */
  icon?: 'save';
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Result of a three-button dialog. Escape, the backdrop and the middle "stay" button all resolve to 'cancel'. */
export type ChoiceResult = 'primary' | 'secondary' | 'cancel';

export interface ChooseOptions extends Omit<ConfirmOptions, 'tone'> {
  /** Label of the extra button, shown first (left). The confirm button stays the only primary and gets the initial focus. */
  secondaryLabel: string;
}

export type ChooseFn = (options: ChooseOptions) => Promise<ChoiceResult>;

export const ChooseContext = createContext<ChooseFn | null>(null);

type Phase = 'in' | 'out';

interface ConfirmDialogProps extends ConfirmOptions {
  /** When set, the dialog shows a third button (before cancel) and resolves with a ChoiceResult. */
  secondaryLabel?: string;
  /** Se llama una sola vez, cuando termina la animación de salida. */
  onResolve: (result: ChoiceResult) => void;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({ title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'primary', icon, secondaryLabel, onResolve }: ConfirmDialogProps) {
  const [phase, setPhase] = useState<Phase>('in');
  const phaseRef = useRef<Phase>('in');
  const result = useRef<ChoiceResult>('cancel');
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const finish = useCallback((choice: ChoiceResult) => {
    if (phaseRef.current === 'out') return;
    phaseRef.current = 'out';
    result.current = choice;
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
        finish('cancel');
        return;
      }
      if (event.key === 'Enter' && !event.repeat) {
        // Sobre Cancelar, Enter activa ese botón; en cualquier otro lugar confirma.
        const targetId = (event.target as HTMLElement).dataset?.testid;
        if (targetId === 'confirm-cancel' || targetId === 'confirm-secondary') return;
        event.preventDefault();
        finish('primary');
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
      <button type="button" className="mac-scrim-dismiss" tabIndex={-1} aria-label="Cancelar" onClick={() => finish('cancel')} />
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
            {icon === 'save'
              ? <>
                <path className="mac-draw mac-draw-circle" d="M5 4h11l3 3v13H5z" pathLength="1" />
                <path className="mac-draw mac-draw-mark" d="M8 4v5h7V4" pathLength="1" />
                <path className="mac-draw mac-draw-mark" d="M8 20v-6h8v6" pathLength="1" />
              </>
              : <circle className="mac-draw mac-draw-circle" cx="12" cy="12" r="9" pathLength="1" />}
            {icon === 'save' ? null : isDanger
              ? <><path className="mac-draw mac-draw-mark" d="M12 7.5v5" pathLength="1" /><path className="mac-draw mac-draw-mark" d="M12 16.2h.01" pathLength="1" /></>
              : <path className="mac-draw mac-draw-mark" d="M8 12.5l3 3 5-6" pathLength="1" />}
          </svg>
        </span>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId} className="mac-dialog-description">{description}</p>
        <div className="mac-dialog-actions">
          {secondaryLabel && <button type="button" data-testid="confirm-secondary" className="mac-btn mac-btn-secondary" onClick={() => finish('secondary')}>{secondaryLabel}</button>}
          <button type="button" data-testid="confirm-cancel" className="mac-btn mac-btn-secondary" onClick={() => finish('cancel')}>{cancelLabel}</button>
          <button ref={confirmRef} type="button" data-testid="confirm-accept" className={`mac-btn ${isDanger ? 'mac-btn-danger' : 'mac-btn-primary'}`} autoFocus onClick={() => finish('primary')}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface PendingRequest {
  options: ConfirmOptions;
  secondaryLabel?: string;
  resolve: (result: ChoiceResult) => void;
}

/** Monta un único diálogo y expone confirm() (boolean) y choose() (tres botones) como promesas. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const requestRef = useRef<PendingRequest | null>(null);

  const open = useCallback((options: ConfirmOptions, secondaryLabel?: string) => new Promise<ChoiceResult>((resolve) => {
    // Un segundo diálogo mientras hay uno abierto se rechaza (cancel) para no apilar diálogos.
    if (requestRef.current) {
      resolve('cancel');
      return;
    }
    requestRef.current = { options, secondaryLabel, resolve };
    setRequest(requestRef.current);
  }), []);

  const confirm = useCallback<ConfirmFn>(async (options) => (await open(options)) === 'primary', [open]);
  const choose = useCallback<ChooseFn>(({ secondaryLabel, ...options }) => open(options, secondaryLabel), [open]);

  const handleResolve = useCallback((result: ChoiceResult) => {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(result);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      <ChooseContext.Provider value={choose}>
        {children}
        {request && <ConfirmDialog {...request.options} secondaryLabel={request.secondaryLabel} onResolve={handleResolve} />}
      </ChooseContext.Provider>
    </ConfirmContext.Provider>
  );
}
