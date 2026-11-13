/**
 * "Borrar todos los datos": orquesta el borrado en Rust (SQLite + carpetas) y la limpieza de las claves de
 * localStorage (actuales y anteriores) para que nada se vuelva a importar. Las preferencias de interfaz no se tocan.
 */
import { queueToastAfterReload } from '../storage/dataBoot';
import { getActiveSqliteStorage } from '../storage/sqliteStorage';
import { APP_KEY_PREFIXES, BACKUP_PREFIX, LEGACY_KEY_MIGRATIONS, STORAGE_KEYS } from '../storage/storageKeys';
import { isTauri, tauriDb } from '../storage/tauriDb';
import type { TauriDb, WipeResult } from '../storage/tauriDb';
import { PRE_IMPORT_PREFIX, saveSafetySnapshot } from '../storage/backupService';

export const WIPE_CONFIRM_WORD = 'BORRAR';

/** Preferencias de interfaz que sobreviven al borrado (nombre actual y anterior del tema). */
const UI_PREFERENCE_KEYS: ReadonlySet<string> = new Set([
  STORAGE_KEYS.sidebarTheme,
  ...LEGACY_KEY_MIGRATIONS.filter(({ to }) => to === STORAGE_KEYS.sidebarTheme).map(({ from }) => from),
]);

/** Metadatos que Rust conserva en SQLite (esquema, último respaldo, marca de migración): no son datos del negocio. */
const SQLITE_KEPT_META: ReadonlySet<string> = new Set([STORAGE_KEYS.schema, STORAGE_KEYS.lastBackup, STORAGE_KEYS.migration]);

export type WipeDecision = 'wipe' | 'keep';

/**
 * Qué pasa con una clave de localStorage. Todo lo que es de la app (prefijos actuales y anteriores) se borra,
 * incluidas las copias de seguridad `jc-motors:backup:*` (contienen datos del negocio), salvo las preferencias de
 * interfaz y, si no se pidió borrar el taller, los datos del taller. Lo ajeno a la app no se toca.
 */
export function classifyWipeKey(key: string, includeWorkshop: boolean): WipeDecision {
  if (!APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) return 'keep';
  if (UI_PREFERENCE_KEYS.has(key)) return 'keep';
  if (key === STORAGE_KEYS.businessInfo) return includeWorkshop ? 'wipe' : 'keep';
  return 'wipe';
}

export function keysToWipe(keys: readonly string[], includeWorkshop: boolean): string[] {
  return keys.filter((key) => classifyWipeKey(key, includeWorkshop) === 'wipe');
}

/** Claves que viven en SQLite y que Rust borra de verdad (para limpiar la memoria sin escribir de nuevo). */
export function isSqliteWipedKey(key: string, includeWorkshop: boolean): boolean {
  return classifyWipeKey(key, includeWorkshop) === 'wipe' && !SQLITE_KEPT_META.has(key) && !key.startsWith(BACKUP_PREFIX);
}

/** Confirmación escrita: «BORRAR», sin importar mayúsculas ni espacios alrededor. */
export function isWipeConfirmText(text: string): boolean {
  return text.trim().toLocaleUpperCase('es') === WIPE_CONFIRM_WORD;
}

export interface WipeCounts {
  quotations: number;
  customers: number;
  invoices: number;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

function joinSpanish(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** «Se borrarán 12 cotizaciones, 8 clientes y 3 facturas.» Los conceptos en cero se omiten. */
export function buildWipeSummary({ quotations, customers, invoices }: WipeCounts): string {
  const parts: string[] = [];
  if (quotations > 0) parts.push(plural(quotations, 'cotización', 'cotizaciones'));
  if (customers > 0) parts.push(plural(customers, 'cliente', 'clientes'));
  if (invoices > 0) parts.push(plural(invoices, 'factura', 'facturas'));
  if (parts.length === 0) return 'No hay cotizaciones, clientes ni facturas guardados.';
  const total = quotations + customers + invoices;
  return `${total === 1 ? 'Se borrará' : 'Se borrarán'} ${joinSpanish(parts)}.`;
}

export interface WipeDeps {
  tauri: boolean;
  db: Pick<TauriDb, 'wipeAllData'>;
  /** localStorage real (nunca el almacén enrutado a SQLite). */
  storage: Storage | undefined;
  /** Memoria enrutada a SQLite, si está activa. */
  sqlite: { flush(): Promise<void>; resetAfterWipe(shouldRemove: (key: string) => boolean): void } | undefined;
  /** Copia de seguridad en localStorage antes de borrar (solo fuera de Tauri). Devuelve la clave creada o `null` si no cupo. */
  safetySnapshot: () => string | null;
}

function realLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

function listStorageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null) keys.push(key);
  }
  return keys;
}

function defaultSnapshot(): string | null {
  const storage = realLocalStorage();
  if (!saveSafetySnapshot()) return null;
  return storage ? listStorageKeys(storage).find((key) => key.startsWith(PRE_IMPORT_PREFIX)) ?? null : null;
}

function defaultDeps(): WipeDeps {
  return { tauri: isTauri(), db: tauriDb(), storage: realLocalStorage(), sqlite: getActiveSqliteStorage(), safetySnapshot: defaultSnapshot };
}

/** Quita las claves de localStorage; si una falla, vuelve a escribir las que ya quitó y lanza. */
function removeKeysWithRollback(storage: Storage, keys: readonly string[]): void {
  const removed = new Map<string, string>();
  try {
    for (const key of keys) {
      const value = storage.getItem(key);
      if (value === null) continue;
      removed.set(key, value);
      storage.removeItem(key);
    }
  } catch (error) {
    for (const [key, value] of removed) {
      try { storage.setItem(key, value); } catch { /* Se intenta restaurar el resto. */ }
    }
    throw error;
  }
}

/** Resultado del borrado. Fuera de Tauri solo trae los conteos de claves quitadas. */
export type WipeOutcome = Partial<WipeResult> & { keysRemoved: number };

export async function wipeAllData(options: { includeWorkshop: boolean }, deps: WipeDeps = defaultDeps()): Promise<WipeOutcome> {
  const { includeWorkshop } = options;
  const { storage } = deps;

  if (deps.tauri) {
    // Lo que sigue en cola debe llegar a SQLite ANTES del borrado; si no, podría reescribirse después.
    if (deps.sqlite) await deps.sqlite.flush();
    const result = await deps.db.wipeAllData(includeWorkshop); // Rechaza sin borrar nada si la copia o la transacción fallan.
    deps.sqlite?.resetAfterWipe((key) => isSqliteWipedKey(key, includeWorkshop));
    let keysRemoved = 0;
    if (storage) {
      // La base ya está limpia: lo que quede en localStorage son restos anteriores a la migración; se quitan uno a uno.
      for (const key of keysToWipe(listStorageKeys(storage), includeWorkshop)) {
        try {
          storage.removeItem(key);
          keysRemoved += 1;
        } catch (error) {
          console.error('[borrar-datos] No se pudo quitar una clave local.', key, error);
        }
      }
    }
    return { ...result, keysRemoved };
  }

  if (!storage) throw new Error('El almacenamiento local no está disponible.');
  const safetyKey = deps.safetySnapshot();
  if (safetyKey === null) throw new Error('No se pudo guardar la copia automática previa al borrado.');
  const keys = keysToWipe(listStorageKeys(storage), includeWorkshop).filter((key) => key !== safetyKey);
  removeKeysWithRollback(storage, keys);
  return { keysRemoved: keys.length };
}

export const DATOS_BORRADOS_TITLE = 'Datos borrados';
export const DATOS_BORRADOS_DESCRIPTION = 'El sistema quedó limpio. La siguiente cotización será JC-0001.';

/** Único punto de enganche tras un borrado exitoso: aviso diferido, ir a Inicio y recargar para releer todo limpio. */
export function onDatosBorrados(): void {
  queueToastAfterReload({ level: 'success', title: DATOS_BORRADOS_TITLE, description: DATOS_BORRADOS_DESCRIPTION });
  if (typeof window === 'undefined') return;
  window.location.hash = '#/';
  window.location.reload();
}
