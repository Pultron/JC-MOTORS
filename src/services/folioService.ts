import { readGuardedJson } from '../storage/corruptBackup';
import type { GuardedReadOptions } from '../storage/corruptBackup';
import { readRaw, writeRaw } from '../storage/safeStorage';
import { STORAGE_KEYS } from '../storage/storageKeys';

const CLAVE_FOLIO_FACTURA = STORAGE_KEYS.invoiceFolio;

/** Consecutivo de facturas: se persiste ANTES de devolverlo y nunca retrocede, ni al borrar. */
export function siguienteFolio(): number {
  const actual = parseInt(readRaw(CLAVE_FOLIO_FACTURA) ?? '0', 10);
  const nuevo = (Number.isFinite(actual) ? actual : 0) + 1;
  writeRaw(CLAVE_FOLIO_FACTURA, String(nuevo));
  return nuevo;
}

/** Garantiza que el contador no quede por debajo de un folio ya asignado (migración de registros). */
export function asegurarContadorMinimo(minimo: number): void {
  const actual = parseInt(readRaw(CLAVE_FOLIO_FACTURA) ?? '0', 10);
  if (!Number.isFinite(actual) || actual < minimo) writeRaw(CLAVE_FOLIO_FACTURA, String(minimo));
}

export const formatearFolio = (n: number): string => String(n).padStart(4, '0');

export const SAVED_DRAFTS_KEY = STORAGE_KEYS.quoteDrafts;

/*
 * Dos consecutivos independientes, que no deben mezclarse:
 *  - Facturas:     STORAGE_KEYS.invoiceFolio    → número como texto ("12"), lo usan siguienteFolio/asegurarContadorMinimo.
 *  - Cotizaciones: STORAGE_KEYS.quotationFolio  → {"lastNumber": 12}, lo usan nextFolio/ensureQuotationFolioAtLeast.
 * Ambos son marcas de agua: solo suben, borrar documentos no los toca.
 */
const QUOTATION_FOLIO_DAMAGED: GuardedReadOptions = {
  backupName: 'quotation-folio',
  damagedMessage: 'El consecutivo de cotizaciones estaba dañado; se guardó una copia de respaldo',
};

function isCounter(value: unknown): value is { lastNumber: number } {
  const last = (value as { lastNumber?: unknown } | null)?.lastNumber;
  return typeof last === 'number' && Number.isSafeInteger(last) && last >= 0;
}

function readQuotationCounter(): number {
  const result = readGuardedJson(STORAGE_KEYS.quotationFolio, QUOTATION_FOLIO_DAMAGED, isCounter);
  return result.status === 'ok' ? result.value.lastNumber : 0;
}

function writeQuotationCounter(lastNumber: number): void {
  writeRaw(STORAGE_KEYS.quotationFolio, JSON.stringify({ lastNumber }));
}

const folioNumber = (folio: string): number => Number(/^JC-(\d+)$/.exec(folio)?.[1] ?? 0);

/**
 * Siguiente folio de cotización: max(contador guardado, mayor folio existente) + 1. El contador se guarda ANTES de
 * devolver el folio y nunca baja, así que borrar la última cotización no repite su número.
 * Si no se puede guardar (almacenamiento lleno), se devuelve el folio calculado igualmente.
 */
export function nextFolio(folios: string[]): string {
  const highestExisting = folios.reduce((value, folio) => Math.max(value, folioNumber(folio)), 0);
  const next = Math.max(readQuotationCounter(), highestExisting) + 1;
  try {
    writeQuotationCounter(next);
  } catch { /* Sin espacio: el folio sigue derivándose de lo existente. */ }
  return `JC-${String(next).padStart(4, '0')}`;
}

/** Sube el contador de cotizaciones hasta un folio ya emitido (p. ej. el de un borrador o un respaldo importado). */
export function ensureQuotationFolioAtLeast(folio: string): void {
  const number = folioNumber(folio);
  if (number <= readQuotationCounter()) return;
  try {
    writeQuotationCounter(number);
  } catch { /* Sin espacio: nextFolio sigue considerando los folios existentes. */ }
}

export function reservedDraftFolios(): string[] {
  try {
    const saved = readRaw(SAVED_DRAFTS_KEY);
    const drafts: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(drafts) ? drafts.map((draft) => draft?.folio).filter((folio): folio is string => typeof folio === 'string') : [];
  } catch {
    return [];
  }
}
