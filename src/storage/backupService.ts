import { isBusinessInfo } from '../config/businessInfo';
import { migrateStorageKeys } from './migrateStorageKeys';
import { getStorage, isQuotaError, listKeys, readRaw, removeRaw, writeRaw } from './safeStorage';
import { APP_KEY_PREFIXES, BACKUP_EXPORT_KEYS, BACKUP_PREFIX, STORAGE_KEYS } from './storageKeys';

export const BACKUP_APP_ID = 'jc-motors';
export const BACKUP_FORMAT_VERSION = 1;
export const PRE_IMPORT_PREFIX = `${BACKUP_PREFIX}pre-import:`;
export const BACKUP_REMINDER_DAYS = 14;

export type ImportMode = 'merge' | 'replace';

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  claves: Record<string, string>;
}

export interface BackupSummary {
  quotations: number;
  invoices: number;
  customers: number;
  internalCosts: number;
  internalControls: number;
}

export interface ImportResult {
  summary: BackupSummary;
  /** Cotizaciones importadas cuyo folio ya lo usa otra cotización distinta (se conservan las dos). */
  folioConflicts: number;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

const LIST_KEYS = {
  [STORAGE_KEYS.quotations]: 'id',
  [STORAGE_KEYS.customers]: 'id',
  [STORAGE_KEYS.templates]: 'id',
  [STORAGE_KEYS.internalControls]: 'quotationId',
  [STORAGE_KEYS.internalCosts]: 'quoteId',
  [STORAGE_KEYS.invoices]: 'uuid',
} as const satisfies Record<string, string>;

const isListKey = (key: string): key is keyof typeof LIST_KEYS => key in LIST_KEYS;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function parseList(raw: string | null): Record<string, unknown>[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function parseCounter(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed: unknown = JSON.parse(raw);
    const value = isRecord(parsed) ? parsed.lastNumber : parsed;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

const folioNumber = (folio: unknown): number => (typeof folio === 'string' ? Number(/^JC-(\d+)$/.exec(folio)?.[1] ?? 0) : 0);

export function backupFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `Respaldo JC Motors - ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Foto completa de lo que se exporta, leída del almacenamiento actual. */
export function buildBackup(now = new Date()): BackupFile {
  const claves: Record<string, string> = {};
  for (const key of BACKUP_EXPORT_KEYS) {
    const raw = readRaw(key);
    if (raw !== null) claves[key] = raw;
  }
  return { app: BACKUP_APP_ID, schemaVersion: BACKUP_FORMAT_VERSION, exportedAt: now.toISOString(), claves };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

function validateClave(key: string, raw: string): void {
  if (isListKey(key)) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new BackupError('El archivo contiene datos dañados.'); }
    if (!Array.isArray(parsed) || !parsed.every(isRecord)) throw new BackupError('El archivo contiene datos con un formato no válido.');
    return;
  }
  if (key === STORAGE_KEYS.quotationFolio) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new BackupError('El archivo contiene un consecutivo dañado.'); }
    if (!isRecord(parsed) || !Number.isSafeInteger(parsed.lastNumber) || (parsed.lastNumber as number) < 0) throw new BackupError('El archivo contiene un consecutivo no válido.');
    return;
  }
  if (key === STORAGE_KEYS.invoiceFolio) {
    if (!/^\d{1,12}$/.test(raw)) throw new BackupError('El archivo contiene un consecutivo de facturas no válido.');
    return;
  }
  if (key === STORAGE_KEYS.sidebarTheme && raw !== 'light' && raw !== 'dark') {
    throw new BackupError('El archivo contiene una preferencia no válida.');
  }
  if (key === STORAGE_KEYS.businessInfo) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new BackupError('El archivo contiene datos del taller dañados.'); }
    if (!isBusinessInfo(parsed)) throw new BackupError('El archivo contiene datos del taller con un formato no válido.');
  }
}

/** Valida que el texto sea un respaldo de esta app y compatible. No toca el almacenamiento. */
export function parseBackup(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('El archivo no es un respaldo válido de JC Motors.');
  }
  if (!isRecord(parsed) || parsed.app !== BACKUP_APP_ID) throw new BackupError('El archivo no es un respaldo de JC Motors.');
  const { schemaVersion, exportedAt, claves } = parsed;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) throw new BackupError('El respaldo no indica su versión.');
  if (schemaVersion > BACKUP_FORMAT_VERSION) throw new BackupError('El respaldo es de una versión más reciente de la app. Actualiza JC Motors para importarlo.');
  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) throw new BackupError('El respaldo no tiene una fecha válida.');
  if (!isRecord(claves)) throw new BackupError('El respaldo no contiene datos.');
  for (const [key, raw] of Object.entries(claves)) {
    if (!BACKUP_EXPORT_KEYS.includes(key)) throw new BackupError('El respaldo contiene datos que esta versión no reconoce.');
    if (typeof raw !== 'string') throw new BackupError('El respaldo tiene un formato no válido.');
    validateClave(key, raw);
  }
  return { app: BACKUP_APP_ID, schemaVersion, exportedAt, claves: claves as Record<string, string> };
}

export function summarizeBackup(backup: Pick<BackupFile, 'claves'>): BackupSummary {
  const count = (key: string) => parseList(backup.claves[key] ?? null).length;
  return {
    quotations: count(STORAGE_KEYS.quotations),
    invoices: count(STORAGE_KEYS.invoices),
    customers: count(STORAGE_KEYS.customers),
    internalCosts: count(STORAGE_KEYS.internalCosts),
    internalControls: count(STORAGE_KEYS.internalControls),
  };
}

export function summarizeCurrent(): BackupSummary {
  return summarizeBackup(buildBackup());
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "32 cotizaciones, 5 facturas, 18 clientes" (los costos internos solo aparecen si hay). */
export function formatSummary(summary: BackupSummary): string {
  const parts = [
    plural(summary.quotations, 'cotización', 'cotizaciones'),
    plural(summary.invoices, 'factura', 'facturas'),
    plural(summary.customers, 'cliente', 'clientes'),
  ];
  if (summary.internalCosts > 0) parts.push(plural(summary.internalCosts, 'registro de costos', 'registros de costos'));
  return parts.join(', ');
}

export function hasAnyData(): boolean {
  const summary = summarizeCurrent();
  return summary.quotations + summary.invoices + summary.customers + summary.internalCosts + summary.internalControls > 0;
}

/** Copia del estado actual completo (incluye borradores y autoguardado) antes de importar. */
function buildSafetySnapshot(now = new Date()): BackupFile {
  const claves: Record<string, string> = {};
  const storage = getStorage();
  for (const key of listKeys()) {
    if (key.startsWith(BACKUP_PREFIX) || !APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    try {
      const raw = storage?.getItem(key);
      if (raw !== null && raw !== undefined) claves[key] = raw;
    } catch { /* Una clave ilegible no impide copiar las demás. */ }
  }
  return { app: BACKUP_APP_ID, schemaVersion: BACKUP_FORMAT_VERSION, exportedAt: now.toISOString(), claves };
}

/**
 * Guarda el estado actual en jc-motors:backup:pre-import:<timestamp> y deja solo la copia más reciente.
 * Devuelve false si no cupo (almacenamiento lleno): el llamador debe ofrecer guardar un archivo.
 */
export function saveSafetySnapshot(now = new Date()): boolean {
  const key = `${PRE_IMPORT_PREFIX}${now.getTime()}`;
  try {
    writeRaw(key, serializeBackup(buildSafetySnapshot(now)));
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    return false;
  }
  for (const other of listKeys()) if (other.startsWith(PRE_IMPORT_PREFIX) && other !== key) removeRaw(other);
  return true;
}

export function readLastBackupAt(): string | null {
  try {
    const raw = readRaw(STORAGE_KEYS.lastBackup);
    const value = raw ? (JSON.parse(raw) as { exportedAt?: unknown }).exportedAt : null;
    return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

export function markBackupExported(exportedAt: string): void {
  try {
    writeRaw(STORAGE_KEYS.lastBackup, JSON.stringify({ exportedAt }));
  } catch { /* Sin espacio, el respaldo ya se guardó en el archivo; solo falta la fecha. */ }
}

/** Días enteros desde el último respaldo; null si nunca se hizo uno. */
export function daysSinceLastBackup(now = Date.now()): number | null {
  const last = readLastBackupAt();
  return last === null ? null : Math.floor((now - Date.parse(last)) / (24 * 60 * 60 * 1000));
}

export function shouldRemindBackup(now = Date.now()): boolean {
  const days = daysSinceLastBackup(now);
  return days === null ? hasAnyData() : days > BACKUP_REMINDER_DAYS;
}

function mergeList(key: keyof typeof LIST_KEYS, localRaw: string | null, incomingRaw: string): { raw: string; added: Record<string, unknown>[] } {
  const identity = LIST_KEYS[key];
  let local: unknown[] = [];
  try {
    const parsed: unknown = localRaw ? JSON.parse(localRaw) : [];
    if (Array.isArray(parsed)) local = parsed;
  } catch { /* Lo local ilegible queda en la copia previa a la importación. */ }
  const known = new Set(local.filter(isRecord).map((entry) => entry[identity]).filter((id) => typeof id === 'string'));
  const added = parseList(incomingRaw).filter((entry) => {
    const id = entry[identity];
    if (typeof id !== 'string' || known.has(id)) return false;
    known.add(id);
    return true;
  });
  return { raw: JSON.stringify([...local, ...added]), added };
}

/**
 * Aplica un respaldo ya validado. Combinar une por id sin duplicar y conserva lo local; Reemplazar deja los datos como
 * el archivo. En ambos modos los consecutivos de folio se quedan con el MAYOR valor (nunca bajan). Si algo falla a
 * medias, restaura todo lo que tocó y lanza.
 */
export function applyBackup(backup: BackupFile, mode: ImportMode): ImportResult {
  // Copia primero las claves anteriores que sigan pendientes: así Reemplazar no deja que reaparezcan.
  migrateStorageKeys();
  const before = new Map<string, string | null>();
  const direct = (key: string): string | null => {
    try { return getStorage()?.getItem(key) ?? null; } catch { return null; }
  };
  const write = (key: string, value: string) => {
    if (!before.has(key)) before.set(key, direct(key));
    writeRaw(key, value);
  };
  const remove = (key: string) => {
    if (!before.has(key)) before.set(key, direct(key));
    removeRaw(key);
  };

  try {
    let folioConflicts = 0;
    const resulting: Record<string, string> = {};

    for (const key of BACKUP_EXPORT_KEYS) {
      const incoming = backup.claves[key];
      const local = readRaw(key);
      if (isListKey(key)) {
        if (mode === 'replace') {
          // A backup made before templates existed has no templates key: it says nothing about them, so the local ones stay.
          if (incoming === undefined) {
            if (key !== STORAGE_KEYS.templates) remove(key);
          } else write(key, incoming);
          resulting[key] = incoming ?? '[]';
        } else if (incoming !== undefined) {
          const merged = mergeList(key, local, incoming);
          write(key, merged.raw);
          resulting[key] = merged.raw;
          if (key === STORAGE_KEYS.quotations) {
            const folios = new Set(parseList(local).map((entry) => entry.folio));
            folioConflicts = merged.added.filter((entry) => folios.has(entry.folio)).length;
          }
        } else {
          resulting[key] = local ?? '[]';
        }
      } else if (key === STORAGE_KEYS.sidebarTheme) {
        if (mode === 'replace' && incoming !== undefined) write(key, incoming);
      } else if (key === STORAGE_KEYS.businessInfo) {
        // Merge keeps the workshop data already on this computer; it only fills a missing one.
        if (incoming !== undefined && (mode === 'replace' || local === null)) write(key, incoming);
      }
    }

    const highestQuotation = Math.max(0, ...parseList(resulting[STORAGE_KEYS.quotations] ?? null).map((entry) => folioNumber(entry.folio)));
    const highestInvoice = Math.max(0, ...parseList(resulting[STORAGE_KEYS.invoices] ?? null).map((entry) => (typeof entry.folio === 'number' ? entry.folio : 0)));
    const quotationCounter = Math.max(parseCounter(readRaw(STORAGE_KEYS.quotationFolio)), parseCounter(backup.claves[STORAGE_KEYS.quotationFolio] ?? null), highestQuotation);
    const invoiceCounter = Math.max(parseCounter(readRaw(STORAGE_KEYS.invoiceFolio)), parseCounter(backup.claves[STORAGE_KEYS.invoiceFolio] ?? null), highestInvoice);
    if (quotationCounter > 0) write(STORAGE_KEYS.quotationFolio, JSON.stringify({ lastNumber: quotationCounter }));
    if (invoiceCounter > 0) write(STORAGE_KEYS.invoiceFolio, String(invoiceCounter));

    // Lo importado puede tener una forma anterior: se vuelve a normalizar en la próxima lectura.
    remove(STORAGE_KEYS.schema);

    return { summary: summarizeBackup({ claves: resulting }), folioConflicts };
  } catch (error) {
    for (const [key, value] of before) {
      try {
        if (value === null) removeRaw(key);
        else getStorage()?.setItem(key, value);
      } catch { /* Se restaura lo que se pueda; el respaldo previo a la importación conserva el resto. */ }
    }
    throw error;
  }
}
