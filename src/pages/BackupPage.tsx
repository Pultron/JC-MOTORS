import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Download, HardDrive, Upload } from 'lucide-react';
import { StorageUsageBar } from '../components/StorageUsageBar';
import { formatDate } from '../utils/dateFormat';
import { Segmented } from '../components/newQuote/primitives/Segmented';
import { Card } from '../components/newQuote/primitives/Card';
import { CardHeader } from '../components/newQuote/primitives/CardHeader';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../hooks/useConfirm';
import {
  BackupError, applyBackup, backupFileName, buildBackup, formatSummary, markBackupExported, parseBackup, readLastBackupAt,
  saveSafetySnapshot, serializeBackup, summarizeBackup, summarizeCurrent,
} from '../storage/backupService';
import type { BackupFile, ImportMode } from '../storage/backupService';
import { isSqliteActive } from '../storage/sqliteStorage';
import { savePdfFile } from '../utils/savePdfFile';
import { SqliteBackupPage } from './SqliteBackupPage';
import '../styles/respaldo.css';

interface PendingImport {
  fileName: string;
  backup: BackupFile;
}


function formatBackupDate(iso: string | null): string {
  return iso ? formatDate(iso, 'dateTime') : 'Todavía no has exportado un respaldo';
}

/** Con SQLite activo (app de escritorio) se usa el respaldo .jcm; en navegador o si la migración falló, el JSON de siempre. */
export function BackupPage() {
  return isSqliteActive() ? <SqliteBackupPage /> : <JsonBackupPage />;
}

function JsonBackupPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(readLastBackupAt);
  const [current, setCurrent] = useState(summarizeCurrent);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState(false);
  const [usageKey, setUsageKey] = useState(0);

  async function saveFile(backup: BackupFile, folio: string): Promise<string | null | undefined> {
    const file = new File([serializeBackup(backup)], `${folio}.json`, { type: 'application/json' });
    return savePdfFile(file, folio, 'save_backup_json');
  }

  async function handleExport() {
    setBusy(true);
    try {
      const backup = buildBackup();
      const saved = await saveFile(backup, backupFileName());
      if (saved === null) return;
      markBackupExported(backup.exportedAt);
      setLastBackupAt(backup.exportedAt);
      toast.success({ title: 'Respaldo exportado', description: saved ? `Se guardó en ${saved}.` : `Incluye ${formatSummary(summarizeBackup(backup))}.` });
    } catch {
      toast.error({ title: 'No se pudo exportar', description: 'Intenta de nuevo. Tus datos no se modificaron.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setPending({ fileName: file.name, backup: parseBackup(await file.text()) });
      setMode('merge');
    } catch (error) {
      setPending(null);
      toast.error({
        title: 'Archivo no válido',
        description: error instanceof BackupError ? `${error.message} No se cambió ningún dato.` : 'No se pudo leer el archivo. No se cambió ningún dato.',
      });
    }
  }

  async function handleImport() {
    if (!pending) return;
    const summary = formatSummary(summarizeBackup(pending.backup));
    const accepted = await confirm({
      title: '¿Importar este respaldo?',
      description: mode === 'merge'
        ? `Se combinarán ${summary} con tus datos, sin duplicar. Antes se guarda una copia de seguridad del estado actual.`
        : `Tus datos se sustituirán por ${summary}. Antes se guarda una copia de seguridad del estado actual.`,
      confirmLabel: 'Importar',
    });
    if (!accepted) return;
    if (mode === 'replace') {
      const sure = await confirm({
        title: '¿Reemplazar todos los datos?',
        description: 'Las cotizaciones, facturas y clientes actuales que no estén en el archivo se eliminarán. Los consecutivos de folio nunca bajan.',
        confirmLabel: 'Reemplazar',
        tone: 'danger',
      });
      if (!sure) return;
    }

    setBusy(true);
    try {
      const snapshotSaved = saveSafetySnapshot();
      setUsageKey((key) => key + 1);
      if (!snapshotSaved) {
        // Sin espacio para la copia en la app: se exige guardarla como archivo antes de tocar nada.
        const saved = await saveFile(buildBackup(), `${backupFileName()} (antes de importar)`);
        if (saved === null) {
          toast.warning({ title: 'Importación cancelada', description: 'No se guardó la copia de seguridad, así que no se cambió ningún dato.' });
          return;
        }
      }
      const result = applyBackup(pending.backup, mode);
      toast.success({
        title: 'Respaldo importado',
        description: `${formatSummary(result.summary)}.${result.folioConflicts ? ` ${result.folioConflicts} cotizaciones comparten folio con otras; revisa el Historial.` : ''} La app se reiniciará para cargar los datos.`,
      });
      window.setTimeout(() => window.location.reload(), 2200);
    } catch {
      setCurrent(summarizeCurrent());
      setUsageKey((key) => key + 1);
      toast.error({ title: 'No se pudo importar', description: 'Se restauraron tus datos tal como estaban.' });
    } finally {
      setBusy(false);
    }
  }

  return <div className="respaldo-page">
    <h1 className="sr-only">Respaldo</h1>
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-5 pb-10 pt-6 sm:px-8">
      <Card as="section">
        <CardHeader icon={<Download size={18} />} title="Exportar respaldo" subtitle="Guarda un archivo con todo tu trabajo." />
        <div className="mac-row"><span className="respaldo-label">Contenido</span><span data-testid="backup-current" className="respaldo-value">{formatSummary(current)}</span></div>
        <div className="mac-row"><span className="respaldo-label">Último respaldo</span><span data-testid="backup-last" className="respaldo-value">{formatBackupDate(lastBackupAt)}</span></div>
        <div className="flex justify-end px-4 py-3">
          <button type="button" data-testid="backup-export" className="mac-btn mac-btn-primary" disabled={busy} onClick={() => void handleExport()}>
            <Download size={16} aria-hidden="true" />Exportar respaldo
          </button>
        </div>
      </Card>

      <Card as="section">
        <CardHeader icon={<HardDrive size={18} />} title="Almacenamiento" subtitle="Espacio que ocupan tus datos en esta computadora." />
        <StorageUsageBar refreshKey={usageKey} />
      </Card>

      <Card as="section">
        <CardHeader icon={<Upload size={18} />} title="Importar respaldo" subtitle="Recupera tus datos desde un archivo de respaldo." />
        <input ref={fileInput} type="file" accept=".json,application/json" data-testid="backup-file" className="sr-only" tabIndex={-1} aria-label="Archivo de respaldo" onChange={(event) => void handleFileChosen(event)} />
        {!pending && <div className="flex justify-end px-4 py-3">
          <button type="button" data-testid="backup-choose" className="mac-btn mac-btn-secondary" disabled={busy} onClick={() => fileInput.current?.click()}>Elegir archivo…</button>
        </div>}
        {pending && <>
          <div className="mac-row"><span className="respaldo-label">Archivo</span><span className="respaldo-value">{pending.fileName}</span></div>
          <div className="mac-row"><span className="respaldo-label">Fecha</span><span className="respaldo-value">{formatBackupDate(pending.backup.exportedAt)}</span></div>
          <div className="mac-row"><span className="respaldo-label">Contenido</span><span data-testid="backup-summary" className="respaldo-value">{formatSummary(summarizeBackup(pending.backup))}</span></div>
          <div className="mac-row"><span className="respaldo-label">Modo</span>
            <Segmented ariaLabel="Modo de importación" testId="backup-mode" value={mode} onChange={(value) => setMode(value as ImportMode)} options={[{ value: 'merge', label: 'Combinar' }, { value: 'replace', label: 'Reemplazar' }]} />
          </div>
          <p className="respaldo-hint">{mode === 'merge'
            ? 'Combinar suma lo que falte sin duplicar y conserva lo que ya tienes.'
            : 'Reemplazar deja tus datos exactamente como el archivo. Pide una segunda confirmación.'}</p>
          <div className="flex justify-end gap-3 px-4 py-3">
            <button type="button" data-testid="backup-cancel" className="mac-btn mac-btn-secondary" disabled={busy} onClick={() => setPending(null)}>Cancelar</button>
            <button type="button" data-testid="backup-import" className={`mac-btn ${mode === 'replace' ? 'mac-btn-danger' : 'mac-btn-primary'}`} disabled={busy} onClick={() => void handleImport()}>Importar</button>
          </div>
        </>}
      </Card>
    </div>
  </div>;
}
