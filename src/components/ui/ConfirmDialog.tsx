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

/** A destructive confirmation that also asks for a short, mandatory free-text reason. */
export interface ReasonPromptOptions extends ConfirmOptions {
  /** Extra paragraph drawn above the field (for example a warning about the current state of the record). */
  note?: string;
  reasonLabel: string;
  maxLength: number;
  /** Quick suggestions drawn as buttons; tapping one fills the field. */
  suggestions?: readonly string[];
}

/** Resolves with the trimmed, non-blank reason when confirmed, or null when the dialog is dismissed. */
export type ReasonPromptFn = (options: ReasonPromptOptions) => Promise<string | null>;

export const ReasonPromptContext = createContext<ReasonPromptFn | null>(null);

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
  /** Optional extra body (form fields, checkboxes) drawn between the description and the buttons. */
  content?: ReactNode;
  /** Disables the confirm button and makes Enter a no-op until the content is valid. */
  confirmDisabled?: boolean;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({ title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'primary', icon, secondaryLabel, onResolve, content, confirmDisabled = false }: ConfirmDialogProps) {
  const [phase, setPhase] = useState<Phase>('in');
  const phaseRef = useRef<Phase>('in');
  const result = useRef<ChoiceResult>('cancel');
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const confirmDisabledRef = useRef(confirmDisabled);
  confirmDisabledRef.current = confirmDisabled;

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
    // Con confirmar deshabilitado, el foco va al campo marcado (o al primer control) en vez de a un botón inactivo.
    const dialog = dialogRef.current;
    const initial = confirmRef.current && !confirmRef.current.disabled
      ? confirmRef.current
      : dialog?.querySelector<HTMLElement>('[data-autofocus]') ?? dialog?.querySelector<HTMLElement>(FOCUSABLE);
    initial?.focus();
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
        const target = event.target as HTMLElement;
        const targetId = target.dataset?.testid;
        if (targetId === 'confirm-cancel' || targetId === 'confirm-secondary') return;
        // Buttons inside the body (suggestion chips) keep their native Enter behavior.
        if (target.closest?.('[data-enter-native]')) return;
        event.preventDefault();
        if (!confirmDisabledRef.current) finish('primary');
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

  // The dialog must resolve exactly once, even if the exit animation never reports its end
  // (window hidden/throttled, animations disabled): otherwise the scrim would stay and block every click.
  const resolvedRef = useRef(false);
  const resolveOnce = useCallback(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onResolve(result.current);
  }, [onResolve]);

  useEffect(() => {
    if (phase !== 'out') return undefined;
    const timer = window.setTimeout(resolveOnce, 450);
    return () => window.clearTimeout(timer);
  }, [phase, resolveOnce]);

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    // Los eventos de pop, draw y scrim también burbujean hasta aquí.
    if (event.animationName === 'dlgOut') resolveOnce();
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
        {content && <div className="mac-dialog-content">{content}</div>}
        <div className={secondaryLabel ? "mac-dialog-actions mac-dialog-actions--stack" : "mac-dialog-actions"}>
          {secondaryLabel && <button type="button" data-testid="confirm-secondary" className="mac-btn mac-btn-secondary" onClick={() => finish('secondary')}>{secondaryLabel}</button>}
          <button type="button" data-testid="confirm-cancel" className="mac-btn mac-btn-secondary" onClick={() => finish('cancel')}>{cancelLabel}</button>
          <button ref={confirmRef} type="button" data-testid="confirm-accept" className={`mac-btn ${isDanger ? 'mac-btn-danger' : 'mac-btn-primary'}`} autoFocus disabled={confirmDisabled} onClick={() => finish('primary')}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface PendingRequest {
  options: ConfirmOptions;
  secondaryLabel?: string;
  reasonPrompt?: ReasonPromptOptions;
  resolve: (result: ChoiceResult, reason?: string) => void;
}

/** Wraps the confirm dialog with the reason field; confirm stays disabled until the trimmed reason is not empty. */
function ReasonDialog({ prompt, onResolve }: { prompt: ReasonPromptOptions; onResolve: (result: ChoiceResult, reason?: string) => void }) {
  const [reason, setReason] = useState('');
  const reasonRef = useRef('');
  const inputId = useId();
  const { note, reasonLabel, maxLength, suggestions = [], ...options } = prompt;

  function change(value: string) {
    const next = value.slice(0, maxLength);
    reasonRef.current = next;
    setReason(next);
  }

  const content = (
    <div className="cancel-dialog-body">
      {note && <p className="cancel-dialog-note" data-testid="reason-note">{note}</p>}
      <label className="cancel-dialog-field" htmlFor={inputId}>
        <span>{reasonLabel}</span>
        <input
          id={inputId}
          data-autofocus
          data-testid="reason-input"
          className="mac-fill-input"
          type="text"
          value={reason}
          maxLength={maxLength}
          autoComplete="off"
          onChange={(event) => change(event.target.value)}
        />
      </label>
      {suggestions.length > 0 && (
        <div className="cancel-dialog-chips" role="group" aria-label="Sugerencias de motivo">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" data-enter-native data-testid="reason-chip" className="cancel-dialog-chip" onClick={() => change(suggestion)}>{suggestion}</button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <ConfirmDialog
      {...options}
      content={content}
      confirmDisabled={reason.trim() === ''}
      onResolve={(result) => onResolve(result, reasonRef.current.trim())}
    />
  );
}

/** Monta un único diálogo y expone confirm() (boolean) y choose() (tres botones) como promesas. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const requestRef = useRef<PendingRequest | null>(null);

  const open = useCallback((options: ConfirmOptions, secondaryLabel?: string, reasonPrompt?: ReasonPromptOptions) => new Promise<{ result: ChoiceResult; reason?: string }>((resolve) => {
    // Un segundo diálogo mientras hay uno abierto se rechaza (cancel) para no apilar diálogos.
    if (requestRef.current) {
      resolve({ result: 'cancel' });
      return;
    }
    requestRef.current = { options, secondaryLabel, reasonPrompt, resolve: (result, reason) => resolve({ result, reason }) };
    setRequest(requestRef.current);
  }), []);

  const confirm = useCallback<ConfirmFn>(async (options) => (await open(options)).result === 'primary', [open]);
  const choose = useCallback<ChooseFn>(async ({ secondaryLabel, ...options }) => (await open(options, secondaryLabel)).result, [open]);
  const promptReason = useCallback<ReasonPromptFn>(async (prompt) => {
    const { result, reason } = await open(prompt, undefined, prompt);
    return result === 'primary' && reason ? reason : null;
  }, [open]);

  const handleResolve = useCallback((result: ChoiceResult, reason?: string) => {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(result, reason);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      <ChooseContext.Provider value={choose}>
        <ReasonPromptContext.Provider value={promptReason}>
          {children}
          {request && (request.reasonPrompt
            ? <ReasonDialog prompt={request.reasonPrompt} onResolve={handleResolve} />
            : <ConfirmDialog {...request.options} secondaryLabel={request.secondaryLabel} onResolve={handleResolve} />)}
        </ReasonPromptContext.Provider>
      </ChooseContext.Provider>
    </ConfirmContext.Provider>
  );
}
