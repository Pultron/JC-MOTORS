/** Acceso defensivo a localStorage: nunca lanza al leer ni al listar; escribir sí lanza para que quien guarda sepa que falló. */
import { legacyKeyFor, STORAGE_KEYS } from './storageKeys';

let storageOverride: Storage | undefined;

/** Sustituye localStorage por otro almacén (SQLite en memoria). `undefined` vuelve a localStorage. */
export function setStorageOverride(storage: Storage | undefined): void {
  storageOverride = storage;
}

export function getStorage(): Storage | undefined {
  if (storageOverride) return storageOverride;
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Mientras la migración de claves no esté marcada como completa, una clave nueva ausente se lee de su clave anterior:
 * así un fallo de copia (cuota llena) nunca deja la app mostrando datos vacíos.
 */
export function readRaw(key: string): string | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const value = storage.getItem(key);
    if (value !== null) return value;
    const legacy = legacyKeyFor(key);
    if (legacy && storage.getItem(STORAGE_KEYS.migration) === null) return storage.getItem(legacy);
    return null;
  } catch {
    return null;
  }
}

/** Lanza si el almacenamiento no está disponible o está lleno (el valor anterior queda intacto). */
export function writeRaw(key: string, value: string): void {
  const storage = getStorage();
  if (!storage) throw new Error('El almacenamiento local no está disponible.');
  storage.setItem(key, value);
  try {
    afterWriteHook?.();
  } catch { /* La revisión de espacio nunca debe hacer fallar un guardado ya hecho. */ }
}

let afterWriteHook: (() => void) | undefined;

/** Permite revisar el espacio ocupado tras escribir sin que este módulo dependa de storageUsage. */
export function setAfterWriteHook(hook: (() => void) | undefined): void {
  afterWriteHook = hook;
}

export function removeRaw(key: string): void {
  try {
    getStorage()?.removeItem(key);
  } catch { /* Nada que quitar si el almacenamiento no responde. */ }
}

export function listKeys(): string[] {
  try {
    const storage = getStorage();
    if (!storage) return [];
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, code } = error as { name?: string; code?: number };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
}
