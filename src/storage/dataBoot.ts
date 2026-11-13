import { quoteDraftService } from '../services/quoteDraftService';
import { bootStorage } from './bootStorage';
import { migrateStorageKeys } from './migrateStorageKeys';
import { readRaw, setStorageOverride } from './safeStorage';
import { DATA_REVERTED_EVENT, SqliteRoutedStorage, setActiveSqliteStorage } from './sqliteStorage';
import { emitStorageNotice } from './storageNotices';
import type { StorageNotice } from './storageNotices';
import { BACKUP_EXPORT_KEYS, STORAGE_KEYS } from './storageKeys';
import { isTauri, tauriDb } from './tauriDb';
import type { TauriDb } from './tauriDb';

export const PENDING_TOAST_KEY = 'jcm:pending-toast';

export type BootResult =
  /** Fuera de Tauri (navegador, pruebas): localStorage como siempre. */
  | { state: 'browser' }
  /** SQLite activo y datos cargados en memoria. */
  | { state: 'ready' }
  /** Base vacía y sin datos en localStorage: hay que mostrar la bienvenida. */
  | { state: 'needs-welcome' }
  /** La base o la migración fallaron: la app sigue con localStorage, sin perder nada. */
  | { state: 'fallback'; error: string; notice: StorageNotice };

export interface BootDeps {
  db?: TauriDb;
  /** Por defecto se detecta `window.__TAURI__`. */
  tauri?: boolean;
  /** Recarga la ventana tras revertir una escritura. Por defecto `location.reload()`. */
  reload?: () => void;
}

/** Datos del negocio que se migran (doc §4): lo exportable sin el tema, más borradores, autoguardado y metadatos. */
export const MIGRATION_KEYS: readonly string[] = [
  ...BACKUP_EXPORT_KEYS.filter((key) => key !== STORAGE_KEYS.sidebarTheme),
  STORAGE_KEYS.quoteDrafts,
  STORAGE_KEYS.quoteAutosave,
  STORAGE_KEYS.schema,
  STORAGE_KEYS.lastBackup,
];

const hasContent = (raw: string | null): raw is string => raw !== null && raw.trim() !== '' && raw.trim() !== '[]';

/** Claves de negocio presentes en localStorage (se leen, nunca se borran). */
export function collectLocalBusinessData(): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const key of MIGRATION_KEYS) {
    const raw = readRaw(key);
    if (raw !== null) keys[key] = raw;
  }
  return keys;
}

const hasBusinessData = (keys: Record<string, string>): boolean =>
  BACKUP_EXPORT_KEYS.some((key) => key !== STORAGE_KEYS.sidebarTheme && hasContent(keys[key] ?? null));

let deps: Required<BootDeps> | undefined;
let reloadHooked = false;

function resolveDeps(options: BootDeps): Required<BootDeps> {
  const tauri = options.tauri ?? isTauri();
  return {
    tauri,
    db: options.db ?? tauriDb(),
    reload: options.reload ?? (() => { if (typeof window !== 'undefined') window.location.reload(); }),
  };
}

async function installSqlite(current: Required<BootDeps>): Promise<void> {
  const snapshot = await current.db.loadSnapshot();
  const storage = new SqliteRoutedStorage({ apply: (changes) => current.db.apply(changes), snapshot });
  setStorageOverride(storage);
  setActiveSqliteStorage(storage);
  hookRevertReload(current);
}

/** Si una escritura optimista de un servicio síncrono falla, la memoria ya se revirtió: se recarga una sola vez la vista. */
function hookRevertReload(current: Required<BootDeps>): void {
  if (reloadHooked || typeof window === 'undefined') return;
  reloadHooked = true;
  let reloading = false;
  window.addEventListener(DATA_REVERTED_EVENT, () => {
    if (reloading) return;
    reloading = true;
    window.setTimeout(current.reload, 2500); // Deja ver el aviso antes de volver a leer lo confirmado.
  });
}

function fallback(error: unknown): BootResult {
  const detail = error instanceof Error ? error.message : String(error);
  console.error('[JC Motors] SQLite no está disponible; se usa localStorage.', detail);
  return {
    state: 'fallback',
    error: detail,
    notice: {
      level: 'warning',
      title: 'Almacenamiento sin actualizar',
      description: 'No se pudo actualizar el almacenamiento; sigues trabajando como antes y no se perdió nada.',
    },
  };
}

/** Se ejecuta una vez, antes de montar React. Nunca lanza; nunca borra ni modifica localStorage. */
export async function bootData(options: BootDeps = {}): Promise<BootResult> {
  const current = resolveDeps(options);
  deps = current;
  if (!current.tauri) return { state: 'browser' };

  let initialized: boolean;
  try {
    const status = await current.db.open();
    initialized = status.initialized;
    if (status.corruptMovedTo) {
      emitStorageNotice({
        level: 'warning',
        title: 'Se encontró una base dañada',
        description: 'Se apartó el archivo dañado y se creó uno nuevo. Puedes restaurar un respaldo desde la pantalla Respaldo.',
      });
    }
  } catch (error) {
    return fallback(error);
  }

  try {
    if (initialized) {
      await installSqlite(current);
      return { state: 'ready' };
    }
    migrateStorageKeys();
    const local = collectLocalBusinessData();
    if (!hasBusinessData(local)) return { state: 'needs-welcome' };
    await current.db.migrateFromLocal(local);
    await installSqlite(current);
    return { state: 'ready' };
  } catch (error) {
    setStorageOverride(undefined);
    setActiveSqliteStorage(undefined);
    return fallback(error);
  }
}

/** «Empezar desde cero» en la bienvenida. */
export async function startFresh(options: BootDeps = {}): Promise<void> {
  const current = deps ?? resolveDeps(options);
  deps = current;
  await current.db.markInitialized();
  await installSqlite(current);
}

/**
 * Welcome flow in Tauri: loads the (empty) snapshot and routes storage to SQLite so the welcome screens can save or
 * restore, but writes NOTHING: `initialized` is only set when the user picks "Empezar de cero" (see `markFreshInitialized`).
 */
export async function prepareWelcome(options: BootDeps = {}): Promise<BootResult> {
  const current = deps ?? resolveDeps(options);
  deps = current;
  try {
    await installSqlite(current);
    return { state: 'needs-welcome' };
  } catch (error) {
    setStorageOverride(undefined);
    setActiveSqliteStorage(undefined);
    return fallback(error);
  }
}

/** The user chose "Empezar de cero": from now on this database counts as set up. SQLite is already installed. */
export async function markFreshInitialized(options: BootDeps = {}): Promise<void> {
  const current = deps ?? resolveDeps(options);
  deps = current;
  if (!current.tauri) return;
  await current.db.markInitialized();
}

function showPendingToast(): void {
  try {
    const raw = globalThis.sessionStorage?.getItem(PENDING_TOAST_KEY);
    if (!raw) return;
    globalThis.sessionStorage.removeItem(PENDING_TOAST_KEY);
    const notice = JSON.parse(raw) as StorageNotice;
    if (notice && typeof notice.title === 'string') emitStorageNotice(notice);
  } catch { /* Sin aviso pendiente legible no pasa nada. */ }
}

/** Guarda un aviso para mostrarlo después de recargar la ventana (p. ej. «Respaldo restaurado…»). */
export function queueToastAfterReload(notice: StorageNotice): void {
  try {
    globalThis.sessionStorage?.setItem(PENDING_TOAST_KEY, JSON.stringify(notice));
  } catch { /* Sin aviso: la restauración ya se hizo. */ }
}

/** Tareas de arranque que dependen del backend ya decidido. Llamar justo antes de montar la app. */
export function finishBoot(result: BootResult, options: BootDeps = {}): void {
  if (result.state === 'needs-welcome') {
    // Nothing is written (no draft purge, no automatic copy) until the user chooses how to start.
    showPendingToast();
    return;
  }
  const sqlite = result.state === 'ready';
  if (sqlite) {
    try { quoteDraftService.purgeStale(); } catch { /* Los borradores viejos se quedan hasta el siguiente arranque. */ }
    const db = (deps ?? resolveDeps(options)).db;
    void db.autoBackup().catch((error) => console.warn('[JC Motors] No se pudo hacer la copia automática.', error));
  } else {
    bootStorage();
  }
  if (result.state === 'fallback') emitStorageNotice(result.notice);
  showPendingToast();
}
