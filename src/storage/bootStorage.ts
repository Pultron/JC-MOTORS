import { migrateStorageKeys } from './migrateStorageKeys';
import { setAfterWriteHook } from './safeStorage';
import { checkUsageAfterWrite, warnIfStorageNearlyFull } from './storageUsage';
import { quoteDraftService } from '../services/quoteDraftService';

/** Se ejecuta una vez al arrancar, antes de que React monte y de que cualquier repositorio lea. Nunca lanza. */
export function bootStorage(options: { usageWarnings?: boolean } = {}): void {
  try {
    migrateStorageKeys();
  } catch { /* La app sigue funcionando con lo que haya en el almacenamiento. */ }
  try {
    quoteDraftService.purgeStale();
  } catch { /* Los borradores viejos se quedan hasta el siguiente arranque. */ }
  if (options.usageWarnings === false) return; // Con SQLite no hay cuota de 5 MB que vigilar.
  try {
    setAfterWriteHook(() => checkUsageAfterWrite());
    warnIfStorageNearlyFull();
  } catch { /* Sin aviso de espacio, la app funciona igual. */ }
}
