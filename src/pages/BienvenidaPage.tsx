import { useState } from 'react';
import { useNavigate } from 'react-router';
import { RestoreFlow } from '../components/boot/RestoreFlow';
import { markWelcomeDone } from '../services/welcomeGate';
import { markFreshInitialized } from '../storage/dataBoot';

/** Minimal first-run choice; the full two-panel screen replaces it in the next commit. */
export function BienvenidaPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return <main data-testid="welcome" className="grid min-h-screen place-items-center bg-mac-page px-6 py-10 font-sans">
    <div className="w-full max-w-[520px] rounded-[14px] bg-white p-8 shadow-mac-card">
      <h1 className="text-[24px] font-semibold tracking-tight text-mac-ink">Bienvenido a JC Motors</h1>
      <p className="mt-2 text-[14px] text-mac-ink-2">Elige cómo quieres empezar.</p>
      <div className="mt-6 flex flex-col gap-3">
        <button type="button" data-testid="welcome-fresh" className="mac-btn mac-btn-primary w-full" disabled={busy} onClick={() => void handleStartFresh()}>Empezar de cero</button>
        <div className="flex flex-col items-stretch gap-2 [&>div]:items-stretch">
          <RestoreFlow buttonLabel="Restaurar un respaldo" buttonClassName="mac-btn mac-btn-secondary w-full" onRestored={handleRestored} disabled={busy} />
        </div>
      </div>
      {error && <p role="alert" className="mt-4 text-[13px] font-medium text-mac-danger">{error}</p>}
    </div>
  </main>;
}
