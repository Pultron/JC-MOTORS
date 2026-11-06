import { useMemo } from 'react';
import { getStorageUsage, toMegabytes } from '../storage/storageUsage';

const megabytes = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const LEVEL_LABEL = { ok: 'Espacio suficiente', warning: 'Conviene liberar espacio', danger: 'Casi lleno' } as const;

/** `refreshKey` fuerza a medir de nuevo después de exportar o importar. */
export function StorageUsageBar({ refreshKey = 0 }: { refreshKey?: number }) {
  const usage = useMemo(() => getStorageUsage(), [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const percent = Math.min(100, Math.round(usage.ratio * 100));
  const used = megabytes.format(toMegabytes(usage.usedChars));
  const quota = megabytes.format(toMegabytes(usage.quotaChars));

  return <div className="px-4 py-3" data-testid="storage-usage" data-level={usage.level}>
    <p className="text-sm text-mac-ink">Almacenamiento: {used} MB de ~{quota} MB</p>
    <div role="progressbar" aria-label="Almacenamiento usado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent} % usado. ${LEVEL_LABEL[usage.level]}`} className="storage-bar">
      <div className="storage-bar-fill" data-level={usage.level} style={{ width: `${Math.max(percent, usage.usedChars > 0 ? 1 : 0)}%` }} />
    </div>
    <p className="mt-1.5 text-[13px] text-mac-ink-2">{percent} % usado · {LEVEL_LABEL[usage.level]}. Es una estimación.</p>
  </div>;
}
