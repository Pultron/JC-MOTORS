import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { RESTORE_PHASES } from '../../services/welcomeRestore';
import type { PhaseStatus, RestorePhase } from '../../services/welcomeRestore';

interface Props {
  phases: Record<RestorePhase, PhaseStatus>;
}

/** Step 3a: real progress. A phase is "done" only after its step finished (and it has been shown for a moment). */
export function PasoRestaurando({ phases }: Props) {
  const title = useRef<HTMLHeadingElement>(null);
  // The button that started the restore is gone: keyboard focus moves to the title.
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  const done = RESTORE_PHASES.filter(({ id }) => phases[id] === 'done').length;
  const active = RESTORE_PHASES.some(({ id }) => phases[id] === 'active');
  const percent = Math.round(((done + (active ? 0.5 : 0)) / RESTORE_PHASES.length) * 100);
  return <div data-testid="welcome-step-restaurando" aria-busy="true">
    <h1 ref={title} tabIndex={-1} className="bv-title bv-title--md" style={{ outline: 'none' }}>Restaurando tus datos…</h1>
    <p className="bv-sub bv-sub--sm">No cierres el sistema ni retires la USB.</p>
    <div className="bv-progress" role="progressbar" aria-label="Progreso de la restauración" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span style={{ width: `${percent}%` }} />
    </div>
    <ol className="bv-phases" aria-live="polite">
      {RESTORE_PHASES.map(({ id, label }) => <li key={id} className="bv-phase" data-status={phases[id]} data-testid={`welcome-fase-${id}`}>
        <span className="bv-phase-icon" aria-hidden="true">{phases[id] === 'done' && <Check size={14} strokeWidth={3.5} />}</span>
        <span>{label}<span className="sr-only">{phases[id] === 'done' ? ' (listo)' : phases[id] === 'active' ? ' (en curso)' : ' (pendiente)'}</span></span>
      </li>)}
    </ol>
  </div>;
}
