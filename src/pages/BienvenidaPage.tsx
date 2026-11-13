import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PanelDerecho, PanelMarca } from '../components/bienvenida/BienvenidaLayout';
import { PasoInicio } from '../components/bienvenida/PasoInicio';
import { RestoreFlow } from '../components/boot/RestoreFlow';
import { markWelcomeDone } from '../services/welcomeGate';
import { markFreshInitialized } from '../storage/dataBoot';
import '../styles/bienvenida.css';

type Step = 'inicio' | 'fresh' | 'restore';

const STEP_INDEX: Record<Step, number> = { inicio: 0, fresh: 1, restore: 1 };

/** First-run welcome: full window, outside the app layout. Steps 2 and 3 are filled in by the next commits. */
export function BienvenidaPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('inicio');
  const [stepKey, setStepKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  const go = (next: Step) => {
    setStep(next);
    setStepKey((key) => key + 1);
    setError(null);
  };
  const canGoBack = step !== 'inicio';
  const goBack = () => { if (!busy) go('inicio'); };

  // Esc = Back on the sub-steps.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && stepRef.current !== 'inicio' && !busy && !event.defaultPrevented) go('inicio');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);

  async function handleStartFresh() {
    setBusy(true);
    setError(null);
    try {
      await markFreshInitialized();
      markWelcomeDone();
      navigate('/', { replace: true });
    } catch (caught) {
      console.error('[JC Motors] No se pudo iniciar la base de datos.', caught);
      setError('No se pudo preparar el almacenamiento. Cierra y vuelve a abrir el sistema.');
      setBusy(false);
    }
  }

  function handleRestored() {
    try { markWelcomeDone(); } catch { /* The restored data keeps the welcome from showing again. */ }
    window.location.hash = '#/';
    window.location.reload();
  }

  return <main className="bv" data-testid="welcome">
    <PanelMarca />
    <PanelDerecho stepIndex={STEP_INDEX[step]} stepKey={stepKey} onBack={canGoBack ? goBack : undefined} backDisabled={busy}>
      {step === 'inicio' && <PasoInicio disabled={busy} onFresh={() => void handleStartFresh()} onRestore={() => go('restore')} />}
      {step === 'restore' && <div>
        <p className="bv-label">Restaurar un respaldo</p>
        <h1 className="bv-title bv-title--md">Trae tus datos</h1>
        <p className="bv-sub bv-sub--sm">Conecta la USB y elige el archivo de respaldo.</p>
        <div className="mt-6 flex flex-col items-stretch gap-2 [&>div]:items-stretch">
          <RestoreFlow buttonLabel="Elegir archivo" buttonClassName="mac-btn mac-btn-secondary w-full" onRestored={handleRestored} />
        </div>
      </div>}
      {error && <p role="alert" className="bv-error">{error}</p>}
    </PanelDerecho>
  </main>;
}
