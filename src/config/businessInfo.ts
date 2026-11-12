import { parseGuardedJson } from '../storage/corruptBackup';
import { readRaw, removeRaw, writeRaw } from '../storage/safeStorage';
import { STORAGE_KEYS } from '../storage/storageKeys';

/** Workshop contact data printed on quotations. `direccion` holds up to two lines separated by "\n". */
export interface BusinessInfo {
  nombre: string;
  telefonos: string[];
  direccion: string;
  correo?: string;
  rfc?: string;
  sitio?: string;
}

/** Exact values that used to be hardcoded in the quotation PDF. */
export const DEFAULT_BUSINESS_INFO: Readonly<BusinessInfo> = Object.freeze({
  nombre: 'JC MOTORS',
  telefonos: Object.freeze(['(667) 351-8806']) as unknown as string[],
  direccion: 'Av. Río Ometepec #1136,\nCol. Morelos, Culiacán, Sin.',
  correo: 'JCMOTORSCLN@gmail.com',
});

export const NAME_MAX = 28;
export const ADDRESS_LINE_MAX = 40;

export type BusinessInfoErrors = Partial<Record<'nombre' | 'telefono' | 'direccion' | 'correo', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const phoneDigits = (value: string): string => value.replace(/\D/g, '');

export function formatTenDigitPhone(value: string): string {
  const digits = phoneDigits(value);
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value.trim();
}

export function addressLines(direccion: string): string[] {
  return direccion.split('\n').map((line) => line.trim()).filter(Boolean);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

export function isBusinessInfo(value: unknown): value is BusinessInfo {
  if (!value || typeof value !== 'object') return false;
  const info = value as Record<string, unknown>;
  return typeof info.nombre === 'string' && info.nombre.trim() !== ''
    && Array.isArray(info.telefonos) && info.telefonos.every((phone) => typeof phone === 'string')
    && typeof info.direccion === 'string'
    && isOptionalString(info.correo) && isOptionalString(info.rfc) && isOptionalString(info.sitio);
}

function cloneDefaults(): BusinessInfo {
  return { ...DEFAULT_BUSINESS_INFO, telefonos: [...DEFAULT_BUSINESS_INFO.telefonos] };
}

/** Missing or damaged data falls back to the defaults. Never throws. */
export function loadBusinessInfo(): BusinessInfo {
  try {
    const result = parseGuardedJson(STORAGE_KEYS.businessInfo, readRaw(STORAGE_KEYS.businessInfo), {
      backupName: 'business-info',
      damagedMessage: 'Los datos del taller estaban dañados; se guardó una copia de respaldo y se usan los valores originales.',
    }, isBusinessInfo);
    return result.status === 'ok' ? { ...result.value, telefonos: [...result.value.telefonos] } : cloneDefaults();
  } catch {
    return cloneDefaults();
  }
}

export function validateBusinessInfo(info: BusinessInfo): BusinessInfoErrors {
  const errors: BusinessInfoErrors = {};
  if (!info.nombre.trim()) errors.nombre = 'Escribe el nombre del taller.';
  else if (info.nombre.trim().length > NAME_MAX) errors.nombre = `Usa máximo ${NAME_MAX} caracteres para que quepa en el encabezado.`;
  const phones = info.telefonos.map((phone) => phone.trim()).filter(Boolean);
  if (phones.length === 0) errors.telefono = 'Escribe un teléfono de 10 dígitos.';
  else if (phones.some((phone) => phoneDigits(phone).length !== 10)) errors.telefono = 'El teléfono debe tener 10 dígitos.';
  const lines = addressLines(info.direccion);
  if (lines.length === 0) errors.direccion = 'Escribe la dirección.';
  else if (lines.length > 2) errors.direccion = 'Usa máximo 2 líneas.';
  else if (lines.some((line) => line.length > ADDRESS_LINE_MAX)) errors.direccion = `Cada línea admite máximo ${ADDRESS_LINE_MAX} caracteres.`;
  if (info.correo?.trim() && !EMAIL.test(info.correo.trim())) errors.correo = 'Escribe un correo válido.';
  return errors;
}

export function normalizeBusinessInfo(info: BusinessInfo): BusinessInfo {
  const normalized: BusinessInfo = {
    nombre: info.nombre.trim(),
    telefonos: info.telefonos.map((phone) => formatTenDigitPhone(phone)).filter(Boolean),
    direccion: addressLines(info.direccion).join('\n'),
  };
  for (const key of ['correo', 'rfc', 'sitio'] as const) {
    const value = info[key]?.trim();
    if (value) normalized[key] = value;
  }
  return normalized;
}

/** Validates and stores. Throws when invalid or when storage is full/unavailable, so the caller can warn. */
export function saveBusinessInfo(info: BusinessInfo): BusinessInfo {
  if (Object.keys(validateBusinessInfo(info)).length > 0) throw new Error('Datos del taller no válidos.');
  const normalized = normalizeBusinessInfo(info);
  writeRaw(STORAGE_KEYS.businessInfo, JSON.stringify(normalized));
  return normalized;
}

/** Removes the stored copy so the original values apply again. */
export function resetBusinessInfo(): BusinessInfo {
  removeRaw(STORAGE_KEYS.businessInfo);
  return cloneDefaults();
}
