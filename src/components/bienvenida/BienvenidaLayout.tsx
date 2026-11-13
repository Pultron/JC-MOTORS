import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import logoUrl from '../../assets/jc-motors-logo.png?url';
import { IlustracionBienvenida } from './IlustracionBienvenida';

export const TOTAL_STEPS = 3;

/** Brand panel (fixed 470px, full height): logo, name and the illustration that fills the rest. No other text. */
export function PanelMarca() {
  return <aside className="bv-left" aria-label="JC Motors">
    <svg className="bv-gear" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <circle cx="100" cy="100" r="80" fill="none" stroke="#fff" strokeWidth="22" strokeDasharray="19 12" />
      <circle cx="100" cy="100" r="58" fill="none" stroke="#fff" strokeWidth="4" />
    </svg>
    <div className="bv-brand">
      <div className="bv-logo"><img src={logoUrl} alt="" draggable={false} /></div>
      <div>
        <p className="bv-brand-name">JC Motors</p>
        <p className="bv-brand-tag">Servicio y mantenimiento automotriz</p>
      </div>
    </div>
    <div className="bv-illus"><IlustracionBienvenida /></div>
  </aside>;
}

interface PanelProps {
  /** 0-based position in the three-dot indicator. */
  stepIndex: number;
  /** Changes on every step so the entrance animation restarts (two identical keyframes alternate by parity). */
  stepKey: number;
  onBack?: () => void;
  backDisabled?: boolean;
  children: ReactNode;
}

/** Right panel: top bar with the orange back button, centered content (max 520px) and the dot indicator. */
export function PanelDerecho({ stepIndex, stepKey, onBack, backDisabled, children }: PanelProps) {
  return <section className="bv-right">
    <div className="bv-top">
      {onBack && <button type="button" className="bv-back" data-testid="welcome-back" disabled={backDisabled} onClick={onBack}><ChevronLeft size={20} aria-hidden="true" />Atrás</button>}
    </div>
    <div className="bv-main">
      <div key={stepKey} className={`bv-step bv-step--${stepKey % 2 === 0 ? 'a' : 'b'}`}>{children}</div>
    </div>
    <div className="bv-dots" role="img" aria-label={`Paso ${stepIndex + 1} de ${TOTAL_STEPS}`}>
      {Array.from({ length: TOTAL_STEPS }, (_, index) => <span key={index} className="bv-dot" data-current={index === stepIndex} />)}
    </div>
  </section>;
}
