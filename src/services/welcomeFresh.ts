/** Pure(ish) logic of the welcome's "Empezar de cero" flow: form values, validation, mapping to BusinessInfo and counters. */
import { normalizeBusinessInfo, validateBusinessInfo } from '../config/businessInfo';
import type { BusinessInfo } from '../config/businessInfo';
import { readRaw, removeRaw } from '../storage/safeStorage';
import { STORAGE_KEYS } from '../storage/storageKeys';
import { applyDatos, toFormValues, validateWorkshopForm } from './workshopForm';
import type { WorkshopFormErrors, WorkshopFormValues } from './workshopForm';
import { countBusinessRecords } from './welcomeGate';

/** Rows shown in step 2a. Same keys as the "Datos del taller" page. */
export type FreshFormValues = Pick<WorkshopFormValues, 'nombre' | 'telefono' | 'calle' | 'colonia' | 'correo'>;
export type FreshFormErrors = WorkshopFormErrors;

/** Order of the rows on screen (also the order in which the first error gets focus). */
export const FRESH_FIELDS = ['nombre', 'telefono', 'calle', 'colonia', 'correo'] as const;

/** Saved workshop data or the defaults, as form rows. */
export function freshInitialValues(info: BusinessInfo): FreshFormValues {
  const { nombre, telefono, calle, colonia, correo } = toFormValues(info);
  return { nombre, telefono, calle, colonia, correo };
}

/** Field rules of the workshop page plus the stored-format rules (the form never produces an address stored info rejects). */
export function validateFreshForm(values: FreshFormValues, base: BusinessInfo): FreshFormErrors {
  const errors = validateWorkshopForm({ ...values, mensaje: '', mensajeFacturas: '' });
  if (Object.keys(errors).length > 0) return errors;
  const stored = validateBusinessInfo(buildFreshInfo(values, base));
  if (stored.nombre) errors.nombre = stored.nombre;
  if (stored.telefono) errors.telefono = stored.telefono;
  if (stored.direccion) errors.calle = stored.direccion;
  if (stored.correo) errors.correo = stored.correo;
  return errors;
}

/** Form rows -> BusinessInfo as it is stored (phone formatted, address on two lines, blank email dropped). */
export function buildFreshInfo(values: FreshFormValues, base: BusinessInfo): BusinessInfo {
  return normalizeBusinessInfo(applyDatos({ ...values, mensaje: '', mensajeFacturas: '' }, base));
}

/**
 * A brand new workshop starts at JC-0001 / invoice 0001. Counters only go up, so they are cleared ONLY when there is no
 * business data at all (a database that was just created or wiped already has them at 0). Returns true when it removed one.
 */
export function ensureCountersAtZero(): boolean {
  if (countBusinessRecords() > 0) return false;
  let removed = false;
  for (const key of [STORAGE_KEYS.quotationFolio, STORAGE_KEYS.invoiceFolio]) {
    if (readRaw(key) === null) continue;
    removeRaw(key);
    removed = true;
  }
  return removed;
}

/** "JC-0001" for the number that follows `lastNumber` (the last folio already issued). */
export function folioAfter(lastNumber: number): string {
  const next = Number.isSafeInteger(lastNumber) && lastNumber > 0 ? lastNumber + 1 : 1;
  return `JC-${String(next).padStart(4, '0')}`;
}
