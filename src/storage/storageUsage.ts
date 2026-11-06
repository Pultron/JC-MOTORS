import { emitStorageNotice } from './storageNotices';
import { getStorage, listKeys } from './safeStorage';
import { APP_KEY_PREFIXES } from './storageKeys';

/**
 * ESTIMACIÓN. localStorage no expone su cuota real: depende del motor (WebView2/Chromium ≈ 5 millones de caracteres,
 * WebKit similar). Se cuentan los caracteres de clave + valor de todo lo que guarda esta app (claves actuales y
 * anteriores mientras existan) y se comparan contra 5 MB. Sirve para avisar con tiempo, no como medida exacta.
 */
export const ESTIMATED_QUOTA_CHARS = 5 * 1024 * 1024;
export const WARNING_RATIO = 0.7;
export const DANGER_RATIO = 0.9;
export const TOAST_RATIO = 0.8;

export type UsageLevel = 'ok' | 'warning' | 'danger';

export interface StorageUsage {
  usedChars: number;
  quotaChars: number;
  ratio: number;
  level: UsageLevel;
}

export function usageLevel(ratio: number): UsageLevel {
  if (ratio > DANGER_RATIO) return 'danger';
  if (ratio >= WARNING_RATIO) return 'warning';
  return 'ok';
}

export function getStorageUsage(): StorageUsage {
  const storage = getStorage();
  let usedChars = 0;
  if (storage) {
    for (const key of listKeys()) {
      if (!APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
      try {
        usedChars += key.length + (storage.getItem(key)?.length ?? 0);
      } catch { /* Una clave ilegible no impide estimar las demás. */ }
    }
  }
  const ratio = usedChars / ESTIMATED_QUOTA_CHARS;
  return { usedChars, quotaChars: ESTIMATED_QUOTA_CHARS, ratio, level: usageLevel(ratio) };
}

export const toMegabytes = (chars: number): number => chars / (1024 * 1024);

let warnedThisSession = false;
let lastCheck = 0;
const CHECK_INTERVAL_MS = 30_000;

/** Un solo toast por sesión al cruzar el 80 %. */
export function warnIfStorageNearlyFull(): void {
  if (warnedThisSession) return;
  const usage = getStorageUsage();
  if (usage.ratio < TOAST_RATIO) return;
  warnedThisSession = true;
  emitStorageNotice({
    level: 'warning',
    title: 'Almacenamiento casi lleno',
    description: `Estás usando alrededor del ${Math.round(usage.ratio * 100)} % del espacio disponible. Haz un respaldo en la sección Respaldo y libera espacio.`,
  });
}

/** Revisión ligera tras escribir: como mucho una vez cada 30 s para no recorrer todo el almacenamiento en cada guardado. */
export function checkUsageAfterWrite(now = Date.now()): void {
  if (warnedThisSession || now - lastCheck < CHECK_INTERVAL_MS) return;
  lastCheck = now;
  warnIfStorageNearlyFull();
}

export function resetUsageWarningForTests(): void {
  warnedThisSession = false;
  lastCheck = 0;
}
