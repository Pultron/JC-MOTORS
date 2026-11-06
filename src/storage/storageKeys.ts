/** Única fuente de claves de localStorage. Formato: jc-motors:<dominio>:v<n>. No escribas claves como texto suelto en otro archivo. */
export const STORAGE_KEYS = {
  quotations: 'jc-motors:quotations:v1',
  quoteDrafts: 'jc-motors:quote-drafts:v1',
  quoteAutosave: 'jc-motors:quote-autosave:v1',
  customers: 'jc-motors:customers:v1',
  internalControls: 'jc-motors:internal-controls:v1',
  internalCosts: 'jc-motors:internal-costs:v1',
  invoices: 'jc-motors:invoices:v1',
  /** Consecutivo de FACTURAS: guarda el número como texto ("12"). Distinto del de cotizaciones. */
  invoiceFolio: 'jc-motors:invoice-folio:v1',
  /** Consecutivo de COTIZACIONES: guarda {"lastNumber": n}. Distinto del de facturas. */
  quotationFolio: 'jc-motors:quotation-folio:v1',
  sidebarTheme: 'jc-motors:sidebar-theme:v1',
  migration: 'jc-motors:meta:migration:v1',
  /** Versión de esquema por dominio: {"quotations": 1}. Solo se normaliza y reescribe cuando es menor a la actual. */
  schema: 'jc-motors:meta:schema:v1',
  lastBackup: 'jc-motors:meta:last-backup:v1',
} as const;

/** Claves que viajan en un archivo de respaldo. Borradores, autoguardado, copias de seguridad y metadatos no. */
export const BACKUP_EXPORT_KEYS: readonly string[] = [
  STORAGE_KEYS.quotations,
  STORAGE_KEYS.customers,
  STORAGE_KEYS.internalControls,
  STORAGE_KEYS.internalCosts,
  STORAGE_KEYS.invoices,
  STORAGE_KEYS.invoiceFolio,
  STORAGE_KEYS.quotationFolio,
  STORAGE_KEYS.sidebarTheme,
];

export const BACKUP_PREFIX = 'jc-motors:backup:';

/** Claves anteriores. Se COPIAN a la nueva y nunca se borran: quedan como respaldo hasta una versión posterior. */
export const LEGACY_KEY_MIGRATIONS: ReadonlyArray<{ readonly from: string; readonly to: string }> = [
  { from: 'jcmotors.invoices', to: STORAGE_KEYS.invoices },
  { from: 'jc-motors-internal-costs-v1', to: STORAGE_KEYS.internalCosts },
  { from: 'jcmotors.folioConsecutivo', to: STORAGE_KEYS.invoiceFolio },
  { from: 'jc-motors-sidebar-theme', to: STORAGE_KEYS.sidebarTheme },
];

/** Prefijos de todo lo que esta app guarda (actuales y anteriores), para medir el espacio ocupado. */
export const APP_KEY_PREFIXES: readonly string[] = ['jc-motors:', 'jc-motors-', 'jcmotors.'];

const LEGACY_BY_NEW = new Map(LEGACY_KEY_MIGRATIONS.map(({ from, to }) => [to, from]));

export function legacyKeyFor(key: string): string | undefined {
  return LEGACY_BY_NEW.get(key);
}
