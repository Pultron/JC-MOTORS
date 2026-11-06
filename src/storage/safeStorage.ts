/** Acceso defensivo a localStorage: nunca lanza al leer ni al listar; escribir sí lanza para que quien guarda sepa que falló. */

export function getStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

export function readRaw(key: string): string | null {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Lanza si el almacenamiento no está disponible o está lleno (el valor anterior queda intacto). */
export function writeRaw(key: string, value: string): void {
  const storage = getStorage();
  if (!storage) throw new Error('El almacenamiento local no está disponible.');
  storage.setItem(key, value);
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
