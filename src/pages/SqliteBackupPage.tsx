import { useCallback, useEffect, useState } from 'react';
import { Download, HardDrive, RefreshCw, Upload } from 'lucide-react';
import { Card } from '../components/newQuote/primitives/Card';
import { CardHeader } from '../components/newQuote/primitives/CardHeader';
import { RestoreFlow } from '../components/boot/RestoreFlow';
import { WipeDangerZone } from '../components/respaldo/WipeDangerZone';
import { useToast } from '../components/ui/Toast';
import { formatBytes, formatLastBackup } from '../storage/backupFormat';
import { formatSummary, markBackupExported, readLastBackupAt, summarizeCurrent } from '../storage/backupService';
import { tauriDb } from '../storage/tauriDb';
import type { Usage } from '../storage/tauriDb';
import '../styles/respaldo.css';

const GUIDE_STEPS = [
  'Exporta el respaldo a una USB.',
  'Instala el sistema en la PC nueva.',
  'Abre el sistema y elige «Restaurar respaldo».',
];

/** Pantalla Respaldo cuando los datos viven en SQLite: archivo .jcm único, restauración y espacio en disco. */
export function SqliteBackupPage() {
  const toast = useToast();
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(readLastBackupAt);
  const [current] = useState(summarizeCurrent);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshUsage = useCallback(() => {
    tauriDb().usage().then(setUsage).catch((error) => console.warn('[JC Motors] No se pudo medir el espacio.', error));
  }, []);
  useEffect(refreshUsage, [refreshUsage]);

  async function handleExport() {
    setBusy(true);
    try {
      const result = await tauriDb().exportBackup();
      if (!result) return; // El usuario canceló el diálogo: no hay aviso.
      markBackupExported(result.exportedAt);
      setLastBackupAt(result.exportedAt);
      refreshUsage();
      toast.success({
        title: `Respaldo guardado (${formatBytes(result.sizeBytes)})`,
        description: `Se guardó en ${result.path}.${result.skippedFiles > 0 ? ` ${result.skippedFiles} archivos de facturas no se encontraron y no se incluyeron.` : ''}`,
      });
    } catch (error) {
      console.error('[JC Motors] No se pudo exportar el respaldo.', error);
      toast.error({ title: 'No se pudo exportar', description: `${error instanceof Error && error.message ? error.message : 'Intenta de nuevo.'} Tus datos no se modificaron.` });
    } finally {
      setBusy(false);
    }
  }

  return <div className="respaldo-page">
    <h1 className="sr-only">Respaldo</h1>
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-5 pb-10 pt-6 sm:px-8">
      <Card as="section">
        <CardHeader icon={<Download size={18} />} title="Respaldo" subtitle="Guarda todo tu trabajo en un solo archivo y llévalo en una USB." />
        <div className="mac-row"><span className="respaldo-label">Contenido</span><span data-testid="backup-current" className="respaldo-value">{formatSummary(current)}</span></div>
        <div className="mac-row"><span className="respaldo-label">Último respaldo</span><span data-testid="backup-last" className="respaldo-value">{formatLastBackup(lastBackupAt)}</span></div>
        <div className="flex flex-wrap justify-end gap-3 px-4 py-3">
          <RestoreFlow buttonLabel="Restaurar respaldo…" disabled={busy} />
          <button type="button" data-testid="backup-export" className="mac-btn mac-btn-primary" disabled={busy} onClick={() => void handleExport()}>
            <Download size={16} aria-hidden="true" />Exportar respaldo…
          </button>
        </div>
      </Card>

      <Card as="section">
        <CardHeader icon={<RefreshCw size={18} />} title="Cambiar de computadora" subtitle="Tres pasos para llevarte tu trabajo." />
        <ol data-testid="backup-guide" className="list-decimal space-y-1 px-9 py-3 text-[14px] text-mac-ink-2">
          {GUIDE_STEPS.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </Card>

      <Card as="section">
        <CardHeader icon={<HardDrive size={18} />} title="Espacio en esta computadora" subtitle="Lo que ocupan tus datos y sus copias." />
        <div data-testid="space-usage">
          <div className="mac-row"><span className="respaldo-label">Base de datos</span><span data-testid="space-db" className="respaldo-value">{usage ? formatBytes(usage.dbBytes) : '…'}</span></div>
          <div className="mac-row"><span className="respaldo-label">Archivos de facturas</span><span data-testid="space-files" className="respaldo-value">{usage ? `${formatBytes(usage.filesBytes)} (${usage.filesCount})` : '…'}</span></div>
          <div className="mac-row"><span className="respaldo-label">Copias automáticas</span><span data-testid="space-auto" className="respaldo-value">{usage ? `${formatBytes(usage.autoBytes)} (${usage.autoCount})` : '…'}</span></div>
        </div>
        <p className="respaldo-hint">Estas copias te protegen si la base se daña, pero no si la computadora falla. Para eso exporta a una USB.</p>
        <p className="px-4 pb-3 pt-1 text-[13px] text-mac-ink-2">
          <Upload size={12} className="mr-1 inline" aria-hidden="true" />Se hace una copia al día al abrir el sistema y se conservan las 7 más recientes.
        </p>
      </Card>

      <WipeDangerZone disabled={busy} onBusyChange={setBusy} />
    </div>
  </div>;
}
