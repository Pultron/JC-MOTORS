import { Check, FileDown, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { tauriDb } from '../../storage/tauriDb';
import type { PickedBackup } from '../../storage/tauriDb';
import { backupMeta, friendlyRestoreError, restoreFigures } from '../../services/welcomeRestore';

interface Props {
  picked: PickedBackup | null;
  error: string | null;
  /** The database was already replaced and the final check failed: the only way forward is reloading. */
  reloadRequired: boolean;
  onPicked: (info: PickedBackup) => void;
  onError: (message: string) => void;
  onDiscard: () => void;
  onRestore: () => void;
  onReload: () => void;
}

const REJECTED_MESSAGE = 'Solo se pueden usar archivos de respaldo (.jcm o .json). No se cambió ningún dato.';

/** Step 2b: choose the backup file (native dialog or dropped on the window) and see what it contains. */
export function PasoRespaldo({ picked, error, reloadRequired, onPicked, onError, onDiscard, onRestore, onReload }: Props) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const busyRef = useRef(false);

  async function stage(pick: () => Promise<PickedBackup | null>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const info = await pick();
      if (info) onPicked(info);
    } catch (caught) {
      console.error('[JC Motors] No se pudo abrir el respaldo.', caught);
      onError(friendlyRestoreError(caught, 'pick'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // The native layer tells the page (constant events, no data) that a file entered, left or was dropped on the window.
  const stageRef = useRef(stage);
  stageRef.current = stage;
  useEffect(() => {
    const enter = () => setOver(true);
    const leave = () => setOver(false);
    const dropped = () => { setOver(false); void stageRef.current(() => tauriDb().pickDroppedBackup()); };
    const rejected = () => { setOver(false); onError(REJECTED_MESSAGE); };
    window.addEventListener('jc:file-drag-enter', enter);
    window.addEventListener('jc:file-drag-leave', leave);
    window.addEventListener('jc:file-dropped', dropped);
    window.addEventListener('jc:file-rejected', rejected);
    return () => {
      window.removeEventListener('jc:file-drag-enter', enter);
      window.removeEventListener('jc:file-drag-leave', leave);
      window.removeEventListener('jc:file-dropped', dropped);
      window.removeEventListener('jc:file-rejected', rejected);
    };
    // onError only forwards a message to the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errorNote = error && <p role="alert" data-testid="welcome-restore-error" className="bv-error">{error}</p>;

  return <div data-testid="welcome-step-respaldo">
    <p className="bv-label">Restaurar un respaldo</p>
    <h1 className="bv-title bv-title--md">Trae tus datos</h1>
    <p className="bv-sub bv-sub--sm">Conecta la USB y elige el archivo de respaldo.</p>

    {!picked && !reloadRequired && <button type="button" className="bv-drop" data-testid="welcome-drop" data-over={over} disabled={busy} aria-label="Elegir archivo de respaldo (.jcm o .json)" onClick={() => void stage(() => tauriDb().pickBackup())}>
      <span className="bv-drop-icon"><Upload size={28} strokeWidth={2} aria-hidden="true" /></span>
      <span className="bv-drop-title">Arrastra aquí tu respaldo</span>
      <span className="bv-drop-sub">o elige el archivo · .jcm o .json</span>
    </button>}

    {picked && !reloadRequired && <div className="bv-file" data-testid="welcome-file">
      <div className="bv-file-head">
        <span className="bv-file-icon"><FileDown size={24} aria-hidden="true" /></span>
        <div className="bv-file-info">
          <p className="bv-file-name" title={picked.fileName}>{picked.fileName}</p>
          <p className="bv-file-meta">{backupMeta(picked)}</p>
        </div>
        <span className="bv-badge"><Check size={14} strokeWidth={3} aria-hidden="true" />Verificado</span>
      </div>
      <ul className="bv-figures" aria-label="Contenido del respaldo">
        {restoreFigures(picked).map((figure) => <li key={figure.label} className="bv-figure"><strong>{figure.value}</strong><span>{figure.label}</span></li>)}
      </ul>
      <p className="bv-file-note">Se cargará todo tal como estaba en la computadora anterior.</p>
    </div>}

    {errorNote}

    {reloadRequired
      ? <div className="bv-actions"><button type="button" className="bv-primary" data-testid="welcome-reload" onClick={onReload}>Volver a cargar</button></div>
      : picked && <div className="bv-actions">
        <button type="button" className="bv-link" data-testid="welcome-otro" disabled={busy} onClick={onDiscard}>Elegir otro archivo</button>
        <button type="button" className="bv-primary" data-testid="welcome-restaurar" disabled={busy} onClick={onRestore}>Restaurar respaldo</button>
      </div>}
  </div>;
}
