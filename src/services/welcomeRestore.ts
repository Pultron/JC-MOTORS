/**
 * Logic of the welcome's "Restaurar un respaldo" flow. It reuses the existing restore commands (tauriDb pick/apply/discard)
 * and only adds: friendly error texts, the summary figures, a phase sequencer and the post-restore check.
 */
import { formatBytes } from '../storage/backupFormat';
import type { PickedBackup, RestoreResult, TauriDb } from '../storage/tauriDb';
import { formatDate } from '../utils/dateFormat';
import { folioAfter } from './welcomeFresh';

// ---------------------------------------------------------------- friendly errors

const NOTHING_CHANGED = 'No se cambió ningún dato.';
const KEPT = 'Tus datos quedaron como estaban.';

export type RestoreErrorStage = 'pick' | 'apply';

export type RestoreErrorKind = 'foreign' | 'damaged' | 'newer' | 'unavailable' | 'unknown';

const MESSAGES: Record<RestoreErrorKind, string> = {
  foreign: 'Ese archivo no es un respaldo de JC Motors. Elige el archivo que guardaste desde la pantalla Respaldo.',
  damaged: 'El archivo está dañado o incompleto y no se puede usar. Prueba con otra copia del respaldo.',
  newer: 'Este respaldo se creó con una versión más nueva de JC Motors. Actualiza el sistema para poder usarlo.',
  unavailable: 'El archivo ya no está disponible. Vuelve a elegirlo.',
  unknown: 'No se pudo leer el archivo. Elige otro respaldo.',
};

const APPLY_MESSAGE = 'No se pudo restaurar el respaldo.';

const textOf = (error: unknown): string => (error instanceof Error ? error.message : typeof error === 'string' ? error : '').toLowerCase();

/** Classifies the Spanish strings that Rust returns (backup.rs MSG_*), without showing them to the user. */
export function classifyRestoreError(error: unknown): RestoreErrorKind {
  const text = textOf(error);
  if (text.includes('más nueva') || text.includes('más nuevo')) return 'newer';
  if (text.includes('no es un respaldo')) return 'foreign';
  if (text.includes('dañad') || text.includes('huellas') || text.includes('integridad') || text.includes('no coincide')) return 'damaged';
  if (text.includes('no hay un respaldo preparado') || text.includes('ya no está disponible')) return 'unavailable';
  return 'unknown';
}

/** Message for the same screen: what happened, in plain words, and that nothing changed. Never technical text. */
export function friendlyRestoreError(error: unknown, stage: RestoreErrorStage): string {
  const kind = classifyRestoreError(error);
  if (stage === 'pick') return `${MESSAGES[kind]} ${NOTHING_CHANGED}`;
  return kind === 'unknown' ? `${APPLY_MESSAGE} ${KEPT}` : `${MESSAGES[kind]} ${KEPT}`;
}

// ---------------------------------------------------------------- summary builders

export interface Figure { label: string; value: string }

const count = new Intl.NumberFormat('es-MX');

/** The four figures of the summary card. «Último folio» is the last quotation folio of the backup. */
export function restoreFigures(info: Pick<PickedBackup, 'quotations' | 'customers' | 'invoices' | 'lastQuotationFolio'>): Figure[] {
  return [
    { label: 'Cotizaciones', value: count.format(info.quotations) },
    { label: 'Clientes', value: count.format(info.customers) },
    { label: 'Facturas', value: count.format(info.invoices) },
    { label: 'Último folio', value: info.lastQuotationFolio > 0 ? `JC-${String(info.lastQuotationFolio).padStart(4, '0')}` : '—' },
  ];
}

/** «Creado el 12 de noviembre de 2026 · 2.4 MB» (parts that cannot be known are left out). */
export function backupMeta(info: Pick<PickedBackup, 'exportedAt' | 'sizeBytes'>): string {
  const date = formatDate(info.exportedAt, 'long');
  const size = info.sizeBytes > 0 ? formatBytes(info.sizeBytes) : '';
  return [date ? `Creado el ${date}` : '', size].filter(Boolean).join(' · ');
}

const plural = (amount: number, one: string, many: string): string => `${amount} ${amount === 1 ? one : many}`;

/** «Se restauraron 12 cotizaciones, 8 clientes y 3 facturas. La siguiente cotización será JC-0013.» */
export function restoreDoneMessage(result: Pick<RestoreResult, 'quotations' | 'customers' | 'invoices' | 'lastQuotationFolio'>): string {
  const verb = result.quotations === 1 ? 'Se restauró' : 'Se restauraron';
  const parts = [
    plural(result.quotations, 'cotización', 'cotizaciones'),
    plural(result.customers, 'cliente', 'clientes'),
    plural(result.invoices, 'factura', 'facturas'),
  ];
  return `${verb} ${parts[0]}, ${parts[1]} y ${parts[2]}. La siguiente cotización será ${folioAfter(result.lastQuotationFolio)}.`;
}

// ---------------------------------------------------------------- real checks

const isCount = (value: unknown): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Phase 1: the staged summary Rust produced after verifying the file is coherent. Throws when it is not. */
export function verifyStagedSummary(info: PickedBackup): void {
  const ok = (info.kind === 'jcm' || info.kind === 'json')
    && [info.quotations, info.customers, info.invoices, info.lastQuotationFolio, info.lastInvoiceFolio].every(isCount);
  if (!ok) throw new Error('El resumen del respaldo no es válido.');
}

/** Phase 3: what was restored matches the summary the user saw. Folios may only be higher (counters never go down). */
export function verifyRestoredMatches(info: PickedBackup, result: RestoreResult): void {
  const same = result.quotations === info.quotations && result.customers === info.customers && result.invoices === info.invoices;
  const folios = result.lastQuotationFolio >= info.lastQuotationFolio && result.lastInvoiceFolio >= info.lastInvoiceFolio;
  if (!same || !folios) throw new Error('Lo restaurado no coincide con el respaldo (huellas).');
}

// ---------------------------------------------------------------- phase sequencer

export type RestorePhase = 'verify' | 'restore' | 'check';
export type PhaseStatus = 'pending' | 'active' | 'done';

export const RESTORE_PHASES: ReadonlyArray<{ id: RestorePhase; label: string }> = [
  { id: 'verify', label: 'Verificando el archivo' },
  { id: 'restore', label: 'Restaurando cotizaciones, clientes y facturas' },
  { id: 'check', label: 'Comprobando que todo quedó igual' },
];

export const MIN_PHASE_MS = 400;

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** A step failed. `phase` says which one; `restored` is true when the database was already replaced. */
export class RestoreStepError extends Error {
  readonly phase: RestorePhase;
  readonly original: unknown;

  constructor(phase: RestorePhase, original: unknown) {
    super(original instanceof Error ? original.message : String(original));
    this.name = 'RestoreStepError';
    this.phase = phase;
    this.original = original;
  }
}

export interface RestoreSteps {
  verify(): Promise<void>;
  restore(): Promise<RestoreResult>;
  check(result: RestoreResult): Promise<void>;
}

/**
 * Runs the real steps in order. Each phase shows as active for at least `minMs` (so it does not flicker) but never
 * waits longer than the step itself needs. A failing step stops the sequence at once, with no extra wait.
 */
export async function runRestorePhases(
  steps: RestoreSteps,
  options: { clock?: Clock; minMs?: number; onPhase?: (phase: RestorePhase, status: PhaseStatus) => void } = {},
): Promise<RestoreResult> {
  const clock = options.clock ?? realClock;
  const minMs = options.minMs ?? MIN_PHASE_MS;
  const notify = options.onPhase ?? (() => {});

  async function phase<T>(id: RestorePhase, run: () => Promise<T>): Promise<T> {
    notify(id, 'active');
    const started = clock.now();
    let value: T;
    try {
      value = await run();
    } catch (error) {
      throw new RestoreStepError(id, error);
    }
    const remaining = minMs - (clock.now() - started);
    if (remaining > 0) await clock.sleep(remaining);
    notify(id, 'done');
    return value;
  }

  await phase('verify', () => steps.verify());
  const result = await phase('restore', () => steps.restore());
  await phase('check', () => steps.check(result));
  return result;
}

// ---------------------------------------------------------------- real steps

export interface RestoreDeps {
  db: Pick<TauriDb, 'applyBackup'>;
  /** The routed SQLite storage, when active. */
  sqlite?: { flush(): Promise<void>; hold(): void; release(): void; invalidate(): void };
  /** Preferences that live in localStorage (the theme of a JSON backup). A failure here never fails the restore. */
  writeLocal(key: string, value: string): void;
}

/**
 * `backup_apply` with the in-memory mirror protected: pending writes are flushed first and held during the swap, so
 * nothing stale can be written into the restored database; after success the mirror is invalidated until the reload.
 */
export async function applyStagedBackup(deps: RestoreDeps): Promise<RestoreResult> {
  await deps.sqlite?.flush();
  deps.sqlite?.hold();
  let result: RestoreResult;
  try {
    result = await deps.db.applyBackup();
  } catch (error) {
    deps.sqlite?.release();
    throw error;
  }
  deps.sqlite?.invalidate();
  for (const [key, value] of Object.entries(result.localKeys ?? {})) {
    try { deps.writeLocal(key, value); } catch { /* A preference (e.g. the theme) is not worth failing the restore. */ }
  }
  return result;
}

/** Whether a failure happened after the database was replaced (only the final check can fail then). */
export const failedAfterReplace = (error: unknown): boolean => error instanceof RestoreStepError && error.phase === 'check';

/** Shown when the database was replaced but the final comparison failed: the page must reload before anything else. */
export const CHECK_FAILED_MESSAGE = 'La restauración terminó, pero no se pudo comprobar que todo quedó igual. Antes de restaurar, tus datos se guardaron en una copia automática. Vuelve a cargar el sistema para continuar.';
