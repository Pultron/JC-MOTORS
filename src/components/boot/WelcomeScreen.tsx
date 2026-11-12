import { useState } from 'react';
import { RestoreFlow } from './RestoreFlow';

export interface WelcomeScreenProps {
  /** El usuario eligió empezar con la base vacía. */
  onStartFresh: () => void | Promise<void>;
  /** Se restauró un respaldo y hay que cargar los datos. */
  onRestored: () => void;
}

/** Primera apertura con base vacía. Va fuera del router y de los providers: sin Toast, los errores salen en la pantalla. */
export function WelcomeScreen({ onStartFresh, onRestored }: WelcomeScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStartFresh() {
    setBusy(true);
    setError(null);
    try {
      await onStartFresh();
    } catch (caught) {
      console.error('[JC Motors] No se pudo iniciar la base de datos.', caught);
      setError('No se pudo preparar el almacenamiento. Cierra y vuelve a abrir el sistema.');
      setBusy(false);
    }
  }

  return <main data-testid="welcome" className="grid min-h-screen place-items-center bg-mac-page px-6 py-10 font-sans">
    <div className="w-full max-w-[520px] rounded-[14px] bg-white p-8 shadow-mac-card">
      <h1 className="text-[24px] font-semibold tracking-tight text-mac-ink">Bienvenido a JC Motors</h1>
      <p className="mt-2 text-[14px] text-mac-ink-2">
        Todavía no hay datos en esta computadora. Puedes empezar desde cero o recuperar tu trabajo desde un respaldo guardado en una USB.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <button type="button" data-testid="welcome-fresh" className="mac-btn mac-btn-primary w-full" disabled={busy} onClick={() => void handleStartFresh()}>Empezar desde cero</button>
        <div className="flex flex-col items-stretch gap-2 [&>div]:items-stretch">
          <RestoreFlow buttonLabel="Restaurar desde un respaldo" buttonClassName="mac-btn mac-btn-secondary w-full" onRestored={onRestored} disabled={busy} />
        </div>
      </div>
      {error && <p role="alert" className="mt-4 text-[13px] font-medium text-mac-danger">{error}</p>}
    </div>
  </main>;
}
