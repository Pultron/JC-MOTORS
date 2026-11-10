import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { AnimationEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
  /** primary is the highlighted default action; the last option is also what Escape picks (see `dismissValue`). */
  tone?: 'primary' | 'secondary';
}

export interface ChoiceOptions<T extends string = string> {
  title: string;
  description: string;
  choices: ChoiceOption<T>[];
  /** Value returned by Escape or a click outside the dialog. */
  dismissValue: T;
}

export type ChoiceFn = <T extends string>(options: ChoiceOptions<T>) => Promise<T>;

const ChoiceContext = createContext<ChoiceFn | null>(null);

const FOCUSABLE = 'button:not([disabled])';

interface ChoiceDialogProps extends ChoiceOptions {
  onResolve: (value: string) => void;
}

/** macOS-style dialog with N stacked actions (the two-button ConfirmDialog cannot express three outcomes). */
function ChoiceDialog({ title, description, choices, dismissValue, onResolve }: ChoiceDialogProps) {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const phaseRef = useRef<'in' | 'out'>('in');
  const result = useRef(dismissValue);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const openerRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);

  const finish = useCallback((value: string) => {
    if (phaseRef.current === 'out') return;
    phaseRef.current = 'out';
    result.current = value;
    setPhase('out');
  }, []);

  useEffect(() => {
    const opener = openerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstRef.current?.focus();
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
        finish(dismissValue);
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
  }, [finish, dismissValue]);

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.animationName === 'dlgOut') onResolve(result.current);
  }

  return createPortal(
    <div className="mac-scrim" data-state={phase}>
      <div className="mac-scrim-bg" aria-hidden="true" />
      <button type="button" className="mac-scrim-dismiss" tabIndex={-1} aria-label="Cancelar" onClick={() => finish(dismissValue)} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} data-testid="choice-dialog" className="mac-dialog" onAnimationEnd={handleAnimationEnd}>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId} className="mac-dialog-description">{description}</p>
        <div className="mac-dialog-actions mac-dialog-actions--stack">
          {choices.map((choice, index) => (
            <button key={choice.value} ref={index === 0 ? firstRef : undefined} type="button" data-testid={`choice-${choice.value}`} className={`mac-btn ${choice.tone === 'primary' ? 'mac-btn-primary' : 'mac-btn-secondary'}`} onClick={() => finish(choice.value)}>{choice.label}</button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface PendingRequest {
  options: ChoiceOptions;
  resolve: (value: string) => void;
}

export function ChoiceProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const requestRef = useRef<PendingRequest | null>(null);

  const choose = useCallback(((options: ChoiceOptions) => new Promise<string>((resolve) => {
    // A second request while one is open is dismissed so dialogs never stack.
    if (requestRef.current) {
      resolve(options.dismissValue);
      return;
    }
    requestRef.current = { options, resolve };
    setRequest(requestRef.current);
  })) as ChoiceFn, []);

  const handleResolve = useCallback((value: string) => {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(value);
  }, []);

  return (
    <ChoiceContext.Provider value={choose}>
      {children}
      {request && <ChoiceDialog {...request.options} onResolve={handleResolve} />}
    </ChoiceContext.Provider>
  );
}

/** choose({ title, description, choices, dismissValue }) resolves to the picked choice's value. */
export function useChoice(): ChoiceFn {
  const choose = useContext(ChoiceContext);
  if (!choose) throw new Error('useChoice debe usarse dentro de ChoiceProvider');
  return choose;
}
