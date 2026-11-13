/** TauriDb falso en memoria con la semántica mínima de Rust: lotes atómicos, base «inicializada» y fallos controlables. */
export function createFakeDb(initial = {}) {
  const state = { store: new Map(Object.entries(initial)), initialized: Object.keys(initial).length > 0, applied: [], failApply: false, failMigrate: false, failOpen: false, autoBackups: 0 };
  const db = {
    open: async () => {
      if (state.failOpen) throw new Error('no se pudo abrir');
      return { initialized: state.initialized, schemaVersion: 1, localMigrationDone: false, corruptMovedTo: null, dataDir: 'fake' };
    },
    loadSnapshot: async () => Object.fromEntries(state.store),
    apply: async (changes) => {
      if (state.failApply) throw new Error('disco lleno');
      state.applied.push(changes);
      for (const { key, value } of changes) {
        if (value === null) state.store.delete(key);
        else state.store.set(key, value);
      }
    },
    markInitialized: async () => { state.initialized = true; },
    migrateFromLocal: async (keys) => {
      if (state.failMigrate) throw new Error('la verificación no coincide');
      for (const [key, value] of Object.entries(keys)) state.store.set(key, value);
      state.initialized = true;
      return { counts: {}, totalsCents: { quotations: 0, invoices: 0 }, lastFolio: { quotation: 0, invoice: 0 }, filesWritten: 0, preBackupPath: 'x' };
    },
    usage: async () => ({ dbBytes: 0, filesBytes: 0, filesCount: 0, autoBytes: 0, autoCount: 0 }),
    autoBackup: async () => { state.autoBackups += 1; return null; },
    exportBackup: async () => null,
    pickBackup: async () => null,
    applyBackup: async () => { throw new Error('no implementado'); },
    discardBackup: async () => {},
    wipeAllData: async (includeWorkshop) => {
      state.wipeCalls = [...(state.wipeCalls ?? []), includeWorkshop];
      if (state.failWipe) throw new Error('falla simulada');
      state.store.clear();
      return { quotations: 0, customers: 0, invoices: 0, backupPath: 'x', filesRemoved: 0, filesFailed: 0 };
    },
  };
  return { db, state };
}
