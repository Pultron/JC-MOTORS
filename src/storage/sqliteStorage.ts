import { emitStorageNotice } from './storageNotices';
import { STORAGE_KEYS } from './storageKeys';
import type { Change } from './tauriDb';

/** Claves que viven en SQLite. Todo lo demás (tema, copias de cuarentena de datos dañados) sigue en localStorage. */
export const SQLITE_KEYS: ReadonlySet<string> = new Set([
  STORAGE_KEYS.quotations,
  STORAGE_KEYS.quoteDrafts,
  STORAGE_KEYS.quoteAutosave,
  STORAGE_KEYS.customers,
  STORAGE_KEYS.templates,
  STORAGE_KEYS.internalControls,
  STORAGE_KEYS.internalCosts,
  STORAGE_KEYS.invoices,
  STORAGE_KEYS.invoiceFolio,
  STORAGE_KEYS.quotationFolio,
  STORAGE_KEYS.businessInfo,
  STORAGE_KEYS.schema,
  STORAGE_KEYS.lastBackup,
  STORAGE_KEYS.migration,
]);

export const DATA_REVERTED_EVENT = 'jcm:data-reverted';

export interface SqliteStorageOptions {
  /** Persiste un lote en UNA transacción (db_apply). Rechaza si la transacción falla. */
  apply: (changes: Change[]) => Promise<void>;
  /** Contenido inicial de las claves de SQLite (db_load_snapshot). */
  snapshot: Record<string, string>;
  /** Almacén para las claves que no van a SQLite. Por defecto, localStorage. */
  fallback?: Storage;
  /** Se llama tras revertir un lote fallido. Por defecto lanza el evento `jcm:data-reverted` en la ventana. */
  onReverted?: (error: unknown) => void;
}

function defaultFallback(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

function defaultOnReverted(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event(DATA_REVERTED_EVENT));
}

interface Waiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

/**
 * Storage enrutado. Las lecturas y escrituras son síncronas (memoria); cada cambio se confirma en SQLite por una cola
 * serializada que agrupa por clave. Si un lote falla, la memoria vuelve al último valor confirmado.
 */
export class SqliteRoutedStorage implements Storage {
  private readonly mirror = new Map<string, string>();
  private readonly confirmed = new Map<string, string>();
  private pending = new Map<string, string | null>();
  private inFlight: Map<string, string | null> | null = null;
  private scheduled = false;
  private waiters: Waiter[] = [];
  private readonly apply: SqliteStorageOptions['apply'];
  private readonly fallback: Storage | undefined;
  private readonly onReverted: (error: unknown) => void;

  constructor(options: SqliteStorageOptions) {
    this.apply = options.apply;
    this.fallback = options.fallback ?? defaultFallback();
    this.onReverted = options.onReverted ?? defaultOnReverted;
    for (const [key, value] of Object.entries(options.snapshot)) {
      if (!SQLITE_KEYS.has(key)) continue;
      this.mirror.set(key, value);
      this.confirmed.set(key, value);
    }
    // Marca de «claves ya migradas» solo en memoria: evita que readRaw resucite las claves anteriores de localStorage.
    if (!this.mirror.has(STORAGE_KEYS.migration)) {
      const marker = JSON.stringify({ sqlite: true });
      this.mirror.set(STORAGE_KEYS.migration, marker);
      this.confirmed.set(STORAGE_KEYS.migration, marker);
    }
  }

  get length(): number {
    return this.allKeys().length;
  }

  key(index: number): string | null {
    return this.allKeys()[index] ?? null;
  }

  getItem(key: string): string | null {
    if (SQLITE_KEYS.has(key)) return this.mirror.get(key) ?? null;
    return this.fallback?.getItem(key) ?? null;
  }

  setItem(key: string, value: string): void {
    const next = String(value);
    if (!SQLITE_KEYS.has(key)) {
      if (!this.fallback) throw new Error('El almacenamiento local no está disponible.');
      this.fallback.setItem(key, next);
      return;
    }
    if (this.mirror.get(key) === next) return;
    this.mirror.set(key, next);
    this.enqueue(key, next);
  }

  removeItem(key: string): void {
    if (!SQLITE_KEYS.has(key)) {
      this.fallback?.removeItem(key);
      return;
    }
    if (!this.mirror.has(key)) return;
    this.mirror.delete(key);
    this.enqueue(key, null);
  }

  clear(): void {
    for (const key of [...this.mirror.keys()]) this.removeItem(key);
    this.fallback?.clear();
  }

  /** Resuelve cuando todo lo escrito hasta ahora está confirmado en SQLite; rechaza si su lote falló (ya revertido). */
  flush(): Promise<void> {
    if (!this.scheduled && this.pending.size === 0 && !this.inFlight) return Promise.resolve();
    return new Promise<void>((resolve, reject) => { this.waiters.push({ resolve, reject }); });
  }

  /** Cambios todavía sin confirmar (para pruebas y diagnóstico). */
  get hasPending(): boolean {
    return this.scheduled || this.pending.size > 0 || this.inFlight !== null;
  }

  private allKeys(): string[] {
    const keys = [...this.mirror.keys()];
    if (this.fallback) {
      for (let index = 0; index < this.fallback.length; index += 1) {
        const key = this.fallback.key(index);
        if (key !== null && !SQLITE_KEYS.has(key)) keys.push(key);
      }
    }
    return keys;
  }

  private enqueue(key: string, value: string | null): void {
    this.pending.set(key, value);
    if (this.scheduled) return;
    this.scheduled = true;
    // Un microtask de espera: lo que se escribe en el mismo turno (contador + cotización) viaja en UN lote.
    void Promise.resolve().then(() => this.drain());
  }

  private async drain(): Promise<void> {
    this.scheduled = false;
    try {
      while (this.pending.size > 0) {
        const batch = this.pending;
        this.pending = new Map();
        this.inFlight = batch;
        const changes: Change[] = [...batch].map(([key, value]) => ({ key, value }));
        await this.apply(changes);
        for (const [key, value] of batch) {
          if (value === null) this.confirmed.delete(key);
          else this.confirmed.set(key, value);
        }
        this.inFlight = null;
      }
      const done = this.waiters;
      this.waiters = [];
      done.forEach((waiter) => waiter.resolve());
    } catch (error) {
      this.revertAll();
      const failed = this.waiters;
      this.waiters = [];
      failed.forEach((waiter) => waiter.reject(error));
      this.notifyReverted(error);
    }
  }

  /** Vuelve al último estado confirmado: lo que estaba en vuelo y lo que se encoló detrás. */
  private revertAll(): void {
    const keys = new Set<string>([...(this.inFlight?.keys() ?? []), ...this.pending.keys()]);
    this.inFlight = null;
    this.pending = new Map();
    for (const key of keys) {
      const value = this.confirmed.get(key);
      if (value === undefined) this.mirror.delete(key);
      else this.mirror.set(key, value);
    }
  }

  private notifyReverted(error: unknown): void {
    try {
      emitStorageNotice({
        level: 'error',
        title: 'No se pudo guardar',
        description: 'El último cambio no se guardó en la base de datos. Tus datos anteriores siguen intactos.',
      });
    } catch { /* El aviso nunca debe ocultar el error original. */ }
    try {
      this.onReverted(error);
    } catch { /* idem */ }
  }
}

let active: SqliteRoutedStorage | undefined;

export function setActiveSqliteStorage(storage: SqliteRoutedStorage | undefined): void {
  active = storage;
}

export function getActiveSqliteStorage(): SqliteRoutedStorage | undefined {
  return active;
}

export const isSqliteActive = (): boolean => active !== undefined;
