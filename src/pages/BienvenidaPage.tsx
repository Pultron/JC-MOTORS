import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PanelDerecho, PanelMarca } from '../components/bienvenida/BienvenidaLayout';
import { PasoInicio } from '../components/bienvenida/PasoInicio';
import { PasoListo } from '../components/bienvenida/PasoListo';
import { PasoTaller } from '../components/bienvenida/PasoTaller';
import { RestoreFlow } from '../components/boot/RestoreFlow';
import { useToast } from '../components/ui/Toast';
import { loadBusinessInfo, saveBusinessInfo } from '../config/businessInfo';
import { peekNextFolio } from '../services/folioService';
import { buildFreshInfo, ensureCountersAtZero, freshInitialValues, validateFreshForm } from '../services/welcomeFresh';
import type { FreshFormValues } from '../services/welcomeFresh';
import { markWelcomeDone } from '../services/welcomeGate';
import { markFreshInitialized } from '../storage/dataBoot';
import { getActiveSqliteStorage } from '../storage/sqliteStorage';
import { userMessage } from '../utils/userMessage';
import '../styles/bienvenida.css';

type Step = 'inicio' | 'fresh' | 'restore' | 'listo';

const STEP_INDEX: Record<Step, number> = { inicio: 0, fresh: 1, restore: 1, listo: 2 };

/** First-run welcome: full window, outside the app layout. */
export function BienvenidaPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<Step>('inicio');
  const [stepKey, setStepKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [base] = useState(loadBusinessInfo);
  const [nextFolio, setNextFolio] = useState('JC-0001');
  const stepRef = useRef(step);
  stepRef.current = step;

  const go = (next: Step) => {
    setStep(next);
    setStepKey((key) => key + 1);
  };
  const canGoBack = step === 'fresh' || step === 'restore';
  const goBack = () => { if (!busy) go('inicio'); };

  // Esc = Back on the sub-steps (never while something is being saved).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const current = stepRef.current;
      if (event.key === 'Escape' && (current === 'fresh' || current === 'restore') && !busy && !event.defaultPrevented) go('inicio');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);

  /** Nothing is written before this point: the database is marked as set up, the workshop saved, counters at zero, flag created. */
  async function handleComenzar(values: FreshFormValues): Promise<boolean> {
    setBusy(true);
    try {
      await markFreshInitialized();
      saveBusinessInfo(buildFreshInfo(values, base));
      ensureCountersAtZero();
      await getActiveSqliteStorage()?.flush();
      markWelcomeDone();
      setNextFolio(peekNextFolio());
      setBusy(false);
      go('listo');
      return true;
    } catch (error) {
      console.error('[JC Motors] No se pudo guardar el taller en la bienvenida.', error);
      toast.error({ title: 'No se pudo guardar', description: userMessage(error, 'taller-guardar') });
      setBusy(false);
      return false;
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
      {step === 'inicio' && <PasoInicio onFresh={() => go('fresh')} onRestore={() => go('restore')} />}
      {step === 'fresh' && <PasoTaller initial={freshInitialValues(base)} validate={(values) => validateFreshForm(values, base)} onSubmit={handleComenzar} nextFolio="JC-0001" />}
      {step === 'restore' && <div>
        <p className="bv-label">Restaurar un respaldo</p>
        <h1 className="bv-title bv-title--md">Trae tus datos</h1>
        <p className="bv-sub bv-sub--sm">Conecta la USB y elige el archivo de respaldo.</p>
        <div className="mt-6 flex flex-col items-stretch gap-2 [&>div]:items-stretch">
          <RestoreFlow buttonLabel="Elegir archivo" buttonClassName="mac-btn mac-btn-secondary w-full" onRestored={handleRestored} />
        </div>
      </div>}
      {step === 'listo' && <PasoListo
        message={`Tu taller está configurado. La siguiente cotización será ${nextFolio}.`}
        buttonLabel="Crear mi primera cotización →"
        onContinue={() => navigate('/nueva-cotizacion', { replace: true })}
      />}
    </PanelDerecho>
  </main>;
}
