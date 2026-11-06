import { emitStorageNotice } from './storageNotices';
import { getStorage } from './safeStorage';
import { LEGACY_KEY_MIGRATIONS, STORAGE_KEYS } from './storageKeys';

export interface MigrationResult {
  status: 'skipped' | 'completed' | 'incomplete' | 'unavailable';
  migrated: string[];
  /** Ya existía la clave nueva: se conserva y la anterior queda intacta. */
  kept: string[];
  failed: string[];
}

/**
 * Copia (nunca mueve ni borra) los datos de las claves anteriores a las nuevas. Corre una sola vez: al terminar sin
 * errores deja jc-motors:meta:migration:v1; si algo falla no marca, y la siguiente apertura vuelve a intentarlo.
 * Es idempotente: no sobrescribe una clave nueva existente.
 */
export function migrateStorageKeys(): MigrationResult {
  const result: MigrationResult = { status: 'skipped', migrated: [], kept: [], failed: [] };
  const storage = getStorage();
  if (!storage) return { ...result, status: 'unavailable' };

  try {
    if (storage.getItem(STORAGE_KEYS.migration) !== null) return result;

    for (const { from, to } of LEGACY_KEY_MIGRATIONS) {
      try {
        const oldValue = storage.getItem(from);
        if (oldValue === null) continue;
        if (storage.getItem(to) !== null) {
          result.kept.push(to);
          continue;
        }
        storage.setItem(to, oldValue);
        if (storage.getItem(to) !== oldValue) {
          storage.removeItem(to);
          result.failed.push(from);
          continue;
        }
        result.migrated.push(to);
      } catch {
        result.failed.push(from);
      }
    }

    if (result.failed.length > 0) {
      result.status = 'incomplete';
      emitStorageNotice({
        level: 'warning',
        title: 'Almacenamiento sin actualizar',
        description: 'No se pudieron copiar algunos datos a su nueva ubicación. Tus datos siguen intactos y se volverá a intentar al abrir la app.',
      });
      return result;
    }

    storage.setItem(STORAGE_KEYS.migration, JSON.stringify({ date: new Date().toISOString(), migrated: result.migrated }));
    result.status = 'completed';
    return result;
  } catch {
    emitStorageNotice({
      level: 'warning',
      title: 'Almacenamiento sin actualizar',
      description: 'No se pudo actualizar el almacenamiento local. Tus datos siguen intactos y se volverá a intentar al abrir la app.',
    });
    return { ...result, status: 'incomplete' };
  }
}
