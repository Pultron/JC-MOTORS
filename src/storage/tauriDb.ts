/** Envoltorios tipados de los comandos de Rust (SQLite y respaldo). Solo existen dentro de Tauri. */

export type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface DbStatus {
  initialized: boolean;
  schemaVersion: number;
  localMigrationDone: boolean;
  corruptMovedTo: string | null;
  dataDir: string;
}

export interface Change {
  key: string;
  value: string | null;
}

export interface EntityCounts {
  quotations: number;
  customers: number;
  invoices: number;
  templates: number;
  internalCosts: number;
  internalControls: number;
  drafts: number;
}

export interface MigrationReport {
  counts: EntityCounts;
  totalsCents: { quotations: number; invoices: number };
  lastFolio: { quotation: number; invoice: number };
  filesWritten: number;
  preBackupPath: string;
}

export interface Usage {
  dbBytes: number;
  filesBytes: number;
  filesCount: number;
  autoBytes: number;
  autoCount: number;
}

export interface ExportResult {
  path: string;
  sizeBytes: number;
  exportedAt: string;
  counts: EntityCounts;
  skippedFiles: number;
}

export interface PickedBackup {
  kind: 'jcm' | 'json';
  fileName: string;
  exportedAt: string;
  quotations: number;
  customers: number;
  invoices: number;
  lastQuotationFolio: number;
  lastInvoiceFolio: number;
  hasCurrentData: boolean;
}

export interface RestoreResult {
  quotations: number;
  customers: number;
  invoices: number;
  lastQuotationFolio: number;
  lastInvoiceFolio: number;
  /** Claves de preferencias que el respaldo JSON trae y que viven en localStorage (p. ej. el tema). */
  localKeys?: Record<string, string>;
}

export interface TauriDb {
  open(): Promise<DbStatus>;
  loadSnapshot(): Promise<Record<string, string>>;
  apply(changes: Change[]): Promise<void>;
  markInitialized(): Promise<void>;
  migrateFromLocal(keys: Record<string, string>): Promise<MigrationReport>;
  usage(): Promise<Usage>;
  autoBackup(): Promise<string | null>;
  exportBackup(): Promise<ExportResult | null>;
  pickBackup(): Promise<PickedBackup | null>;
  applyBackup(): Promise<RestoreResult>;
  discardBackup(): Promise<void>;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && typeof window.__TAURI__?.core?.invoke === 'function';
}

/** Rust devuelve el error como texto en español; se convierte en Error para que las pantallas lo muestren. */
export function createTauriDb(invoke: Invoke): TauriDb {
  const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    try {
      return await invoke<T>(command, args);
    } catch (error) {
      throw error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Error desconocido del almacenamiento.');
    }
  };
  return {
    open: () => call('db_open'),
    loadSnapshot: () => call('db_load_snapshot'),
    apply: (changes) => call('db_apply', { changes }),
    markInitialized: () => call('db_mark_initialized'),
    migrateFromLocal: (keys) => call('db_migrate_from_local', { keys }),
    usage: () => call('db_usage'),
    autoBackup: () => call('db_auto_backup'),
    exportBackup: () => call('backup_export'),
    pickBackup: () => call('backup_pick'),
    applyBackup: () => call('backup_apply'),
    discardBackup: () => call('backup_discard'),
  };
}

let defaultDb: TauriDb | undefined;

/** Acceso real a Tauri (perezoso: solo se arma cuando existe `window.__TAURI__`). */
export function tauriDb(): TauriDb {
  if (!defaultDb) {
    defaultDb = createTauriDb((command, args) => {
      const invoke = window.__TAURI__?.core?.invoke;
      if (!invoke) return Promise.reject(new Error('Esta función solo está disponible en la aplicación de escritorio.'));
      return invoke(command, args);
    });
  }
  return defaultDb;
}
