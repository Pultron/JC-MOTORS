import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PanelDerecho, PanelMarca } from '../components/bienvenida/BienvenidaLayout';
import { PasoInicio } from '../components/bienvenida/PasoInicio';
import { PasoListo } from '../components/bienvenida/PasoListo';
import { PasoRespaldo } from '../components/bienvenida/PasoRespaldo';
import { PasoRestaurando } from '../components/bienvenida/PasoRestaurando';
import { PasoTaller } from '../components/bienvenida/PasoTaller';
import { useToast } from '../components/ui/Toast';
import { loadBusinessInfo, saveBusinessInfo } from '../config/businessInfo';
import { peekNextFolio } from '../services/folioService';
import { buildFreshInfo, ensureCountersAtZero, freshInitialValues, validateFreshForm } from '../services/welcomeFresh';
import type { FreshFormValues } from '../services/welcomeFresh';
import { markWelcomeDone } from '../services/welcomeGate';
import {
  CHECK_FAILED_MESSAGE, applyStagedBackup, failedAfterReplace, friendlyRestoreError, restoreDoneMessage, runRestorePhases,
  verifyRestoredMatches, verifyStagedSummary,
} from '../services/welcomeRestore';
import type { PhaseStatus, RestorePhase } from '../services/welcomeRestore';
import { markFreshInitialized } from '../storage/dataBoot';
import { writeRaw } from '../storage/safeStorage';
import { getActiveSqliteStorage } from '../storage/sqliteStorage';
import { tauriDb } from '../storage/tauriDb';
import type { PickedBackup } from '../storage/tauriDb';
import { userMessage } from '../utils/userMessage';
import '../styles/bienvenida.css';

type Step = 'inicio' | 'fresh' | 'restore' | 'restoring' | 'listo';

const STEP_INDEX: Record<Step, number> = { inicio: 0, fresh: 1, restore: 1, restoring: 2, listo: 2 };

const IDLE_PHASES: Record<RestorePhase, PhaseStatus> = { verify: 'pending', restore: 'pending', check: 'pending' };

interface Done {
  message: string;
  buttonLabel: string;
  /** What the button does: open the first quotation (fresh start) or reload into Inicio (restore). */
  kind: 'fresh' | 'restore';
}

/** Best effort: a dropped path that nobody asked for (or a staged file the user walked away from) is forgotten. */
const forgetStaged = () => { void tauriDb().discardBackup().catch(() => undefined); };

/** First-run welcome: full window, outside the app layout. */
export function BienvenidaPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<Step>('inicio');
  const [stepKey, setStepKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [base] = useState(loadBusinessInfo);
  const [done, setDone] = useState<Done | null>(null);
  const [picked, setPicked] = useState<PickedBackup | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [phases, setPhases] = useState<Record<RestorePhase, PhaseStatus>>(IDLE_PHASES);
  const stepRef = useRef(step);
  stepRef.current = step;
  const pickedRef = useRef(picked);
  pickedRef.current = picked;

  const go = (next: Step) => {
    setStep(next);
    setStepKey((key) => key + 1);
  };
  const canGoBack = step === 'fresh' || step === 'restore';

  function goBack() {
    if (busy) return;
    if (stepRef.current === 'restore') {
      if (pickedRef.current) forgetStaged();
      setPicked(null);
      setRestoreError(null);
    }
    go('inicio');
  }
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;

  // Esc = Back on the sub-steps (never while something is being saved or restored).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const current = stepRef.current;
      if (event.key === 'Escape' && (current === 'fresh' || current === 'restore') && !event.defaultPrevented) goBackRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A file dropped anywhere but on the restore step is ignored (Rust only keeps the path; forget it).
  useEffect(() => {
    const onDropped = () => { if (stepRef.current !== 'restore') forgetStaged(); };
    window.addEventListener('jc:file-dropped', onDropped);
    return () => window.removeEventListener('jc:file-dropped', onDropped);
  }, []);

  /** Nothing is written before this point: the database is marked as set up, the workshop saved, counters at zero, flag created. */
  async function handleComenzar(values: FreshFormValues): Promise<boolean> {
    setBusy(true);
    try {
      await markFreshInitialized();
      saveBusinessInfo(buildFreshInfo(values, base));
      ensureCountersAtZero();
      await getActiveSqliteStorage()?.flush();
      markWelcomeDone();
      setDone({ kind: 'fresh', message: `Tu taller está configurado. La siguiente cotización será ${peekNextFolio()}.`, buttonLabel: 'Crear mi primera cotización →' });
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

  function handleDiscard() {
    forgetStaged();
    setPicked(null);
    setRestoreError(null);
  }

  /** Three real steps: check the staged summary, `backup_apply`, compare what was restored with the summary. */
  async function handleRestore() {
    const info = pickedRef.current;
    if (!info) return;
    setBusy(true);
    setRestoreError(null);
    setPhases(IDLE_PHASES);
    go('restoring');
    try {
      const result = await runRestorePhases({
        verify: async () => verifyStagedSummary(info),
        restore: () => applyStagedBackup({ db: tauriDb(), sqlite: getActiveSqliteStorage(), writeLocal: writeRaw }),
        check: async (restored) => verifyRestoredMatches(info, restored),
      }, { onPhase: (phase, status) => setPhases((current) => ({ ...current, [phase]: status })) });
      try { markWelcomeDone(); } catch { /* The restored data keeps the welcome from showing again. */ }
      setDone({ kind: 'restore', message: restoreDoneMessage(result), buttonLabel: 'Ir al inicio →' });
      setBusy(false);
      go('listo');
    } catch (error) {
      console.error('[JC Motors] No se pudo restaurar el respaldo.', error);
      const replaced = failedAfterReplace(error);
      if (replaced) {
        setReloadRequired(true);
        setRestoreError(CHECK_FAILED_MESSAGE);
      } else {
        forgetStaged(); // The staged copy may be partly consumed: the file is chosen again.
        setPicked(null);
        setRestoreError(friendlyRestoreError(error, 'apply'));
      }
      setBusy(false);
      go('restore');
    }
  }

  /** The restored database replaced the file under the in-memory state, so the window reloads into Inicio. */
  function reloadIntoApp() {
    window.location.hash = '#/';
    window.location.reload();
  }

  function handleContinue() {
    if (done?.kind === 'fresh') navigate('/nueva-cotizacion', { replace: true });
    else reloadIntoApp();
  }

  return <main className="bv" data-testid="welcome">
    <PanelMarca />
    <PanelDerecho stepIndex={STEP_INDEX[step]} stepKey={stepKey} onBack={canGoBack ? goBack : undefined} backDisabled={busy}>
      {step === 'inicio' && <PasoInicio onFresh={() => go('fresh')} onRestore={() => go('restore')} />}
      {step === 'fresh' && <PasoTaller initial={freshInitialValues(base)} validate={(values) => validateFreshForm(values, base)} onSubmit={handleComenzar} nextFolio="JC-0001" />}
      {step === 'restore' && <PasoRespaldo
        picked={picked}
        error={restoreError}
        reloadRequired={reloadRequired}
        onPicked={(info) => { setPicked(info); setRestoreError(null); }}
        onError={setRestoreError}
        onDiscard={handleDiscard}
        onRestore={() => void handleRestore()}
        onReload={reloadIntoApp}
      />}
      {step === 'restoring' && <PasoRestaurando phases={phases} />}
      {step === 'listo' && done && <PasoListo message={done.message} buttonLabel={done.buttonLabel} onContinue={handleContinue} />}
    </PanelDerecho>
  </main>;
}
