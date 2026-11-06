import { migrateStorageKeys } from './migrateStorageKeys';

/** Se ejecuta una vez al arrancar, antes de que React monte y de que cualquier repositorio lea. Nunca lanza. */
export function bootStorage(): void {
  try {
    migrateStorageKeys();
  } catch { /* La app sigue funcionando con lo que haya en el almacenamiento. */ }
}
