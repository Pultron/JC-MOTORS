import { getActiveSqliteStorage } from '../storage/sqliteStorage';

/**
 * Espera a que SQLite confirme lo que escribió `operation`. Si el lote falla, la memoria ya volvió al estado anterior
 * y el error sube a la pantalla: nunca se informa un guardado que no ocurrió.
 */
export async function confirmed<T>(operation: Promise<T>): Promise<T> {
  const result = await operation;
  await getActiveSqliteStorage()?.flush();
  return result;
}
