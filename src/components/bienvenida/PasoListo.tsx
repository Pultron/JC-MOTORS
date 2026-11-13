import { useEffect, useRef } from 'react';

interface Props {
  message: string;
  buttonLabel: string;
  onContinue: () => void;
}

/** Step 3 (done): green circle whose check draws itself. Shared by the fresh start and the restore. */
export function PasoListo({ message, buttonLabel, onContinue }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { button.current?.focus({ preventScroll: true }); }, []);
  return <div className="bv-done" data-testid="welcome-step-listo">
    <div className="bv-ok" aria-hidden="true">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none"><path d="M11 23.5l8 8 15-17" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
    <h1 className="bv-title bv-title--sm">Todo listo</h1>
    <p className="bv-sub bv-sub--sm" data-testid="welcome-listo-mensaje">{message}</p>
    <button ref={button} type="button" className="bv-primary" data-testid="welcome-listo-continuar" onClick={onContinue}>{buttonLabel}</button>
  </div>;
}
