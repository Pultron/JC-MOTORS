import { useState } from 'react';
import { queueToastAfterReload } from '../../storage/dataBoot';
import { formatInvoiceFolio, formatLastBackup, formatQuotationFolio, formatRestoredCounts, restoredMessage } from '../../storage/backupFormat';
import { writeRaw } from '../../storage/safeStorage';
import { tauriDb } from '../../storage/tauriDb';
import type { PickedBackup } from '../../storage/tauriDb';
import { formatDate } from '../../utils/dateFormat';

interface RestoreFlowProps {
  /** Texto del botón que inicia el flujo. */
  buttonLabel: string;
  buttonClassName?: string;
  /** Se llama justo antes de recargar la ventana (por defecto `location.reload()`). */
  onRestored?: () => void;
  disabled?: boolean;
}

type Phase = { kind: 'idle' } | { kind: 'summary'; info: PickedBackup } | { kind: 'confirm'; info: PickedBackup };

const NOTHING_CHANGED = 'No se cambió ningún dato.';

function explain(error: unknown): string {
  const text = error instanceof Error ? error.message.trim() : typeof error === 'string' ? error.trim() : '';
  const base = text || 'No se pudo leer el respaldo.';
  return `${base}${/[.!?]$/.test(base) ? '' : '.'} ${NOTHING_CHANGED}`;
}

/**
 * Elegir respaldo → resumen → (segunda confirmación si ya hay datos) → restaurar → recargar.
 * No usa Toast ni contextos: funciona también en la bienvenida, fuera del router.
 */
export function RestoreFlow({ buttonLabel, buttonClassName = 'mac-btn mac-btn-secondary', onRestored, disabled = false }: RestoreFlowProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick() {
    setBusy(true);
    setError(null);
    try {
      const info = await tauriDb().pickBackup();
      if (info) setPhase({ kind: 'summary', info });
    } catch (caught) {
      console.error('[JC Motors] No se pudo abrir el respaldo.', caught);
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setPhase({ kind: 'idle' });
    setError(null);
    try { await tauriDb().discardBackup(); } catch { /* Nada preparado que descartar. */ }
  }

  async function handleApply() {
    setBusy(true);
    setError(null);
    try {
      const result = await tauriDb().applyBackup();
      for (const [key, value] of Object.entries(result.localKeys ?? {})) {
        try { writeRaw(key, value); } catch { /* Una preferencia (p. ej. el tema) no justifica fallar la restauración. */ }
      }
      queueToastAfterReload({ level: 'success', title: restoredMessage(result) });
      if (onRestored) onRestored(); else window.location.reload();
    } catch (caught) {
      console.error('[JC Motors] No se pudo restaurar el respaldo.', caught);
      setPhase({ kind: 'idle' });
      setError(`${explain(caught).replace(` ${NOTHING_CHANGED}`, '')} Tus datos quedaron como estaban.`);
      setBusy(false);
    }
  }

  function handleAccept(info: PickedBackup) {
    if (info.hasCurrentData && phase.kind === 'summary') {
      setPhase({ kind: 'confirm', info });
      return;
    }
    void handleApply();
  }

  const errorNote = error && <p role="alert" data-testid="restore-error" className="text-[13px] font-medium text-mac-danger">{error}</p>;

  if (phase.kind === 'idle') {
    return <div className="flex flex-col items-end gap-2">
      <button type="button" data-testid="restore-start" className={buttonClassName} disabled={busy || disabled} onClick={() => void handlePick()}>{buttonLabel}</button>
      {errorNote}
    </div>;
  }

  const { info } = phase;
  const confirming = phase.kind === 'confirm';
  return <div data-testid="restore-summary" className="flex w-full flex-col gap-2 text-left">
    <h3 className="text-[15px] font-semibold text-mac-ink">{confirming ? '¿Reemplazar los datos de esta computadora?' : 'Resumen del respaldo'}</h3>
    {!confirming && <dl className="grid grid-cols-[170px_1fr] gap-x-3 gap-y-1 text-[14px]">
      <dt className="text-mac-ink">Archivo</dt><dd className="min-w-0 break-words text-mac-ink-2">{info.fileName}</dd>
      <dt className="text-mac-ink">Fecha del respaldo</dt><dd className="text-mac-ink-2">{formatDate(info.exportedAt, 'dateTime') || formatLastBackup(info.exportedAt)}</dd>
      <dt className="text-mac-ink">Contenido</dt><dd data-testid="restore-counts" className="text-mac-ink-2">{formatRestoredCounts(info)}</dd>
      <dt className="text-mac-ink">Último folio de cotizaciones</dt><dd className="text-mac-ink-2">{formatQuotationFolio(info.lastQuotationFolio)}</dd>
      <dt className="text-mac-ink">Último folio de facturas</dt><dd className="text-mac-ink-2">{formatInvoiceFolio(info.lastInvoiceFolio)}</dd>
    </dl>}
    {confirming && <p className="text-[14px] text-mac-ink-2">
      Esta computadora ya tiene datos. Antes de reemplazarlos se guarda automáticamente una copia de los datos actuales en la carpeta de copias automáticas. Los consecutivos de folio nunca bajan.
    </p>}
    {errorNote}
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" data-testid="restore-cancel" className="mac-btn mac-btn-secondary" disabled={busy} onClick={() => void handleCancel()}>Cancelar</button>
      <button type="button" data-testid="restore-apply" className={`mac-btn ${confirming ? 'mac-btn-danger' : 'mac-btn-primary'}`} disabled={busy} onClick={() => handleAccept(info)}>
        {confirming ? 'Reemplazar y restaurar' : info.hasCurrentData ? 'Continuar' : 'Restaurar'}
      </button>
    </div>
  </div>;
}
