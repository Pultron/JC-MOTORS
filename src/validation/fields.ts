/**
 * Single source of rules for the quote form fields (phone, email, plates, year, quantities, amounts).
 * Validators never throw and never touch stored data: legacy values still load, the rules only apply
 * when the user edits or saves.
 */

import { parseDecimal } from '../utils/currency';

export interface FieldResult {
  ok: boolean;
  /** Spanish message telling the user what to fix. Present when `ok` is false. */
  mensaje?: string;
}

export type DecimalResult =
  | { ok: true; valor: number; /** Canonical text: digits with an optional dot decimal, no separators. */ texto: string }
  | { ok: false; mensaje: string };

export const MIN_YEAR = 1980;
export const MAX_YEAR = new Date().getFullYear() + 1;
export const PHONE_DIGITS = 10;
export const PLATES_MIN_LENGTH = 3;
export const PHONE_MAX_LENGTH = 15;

const OK: FieldResult = { ok: true };
const fail = (mensaje: string): FieldResult => ({ ok: false, mensaje });

/** Newlines and tabs become spaces. Safe to run on every keystroke or paste (never trims). */
export function stripLineBreaks(text: string): string {
  return text.replace(/[\r\n\t\v\f]+/g, ' ');
}

/** Single-line text: newlines/tabs to space, repeated spaces collapsed, trimmed. Run on blur. */
export function sanitizeSingleLine(text: string): string {
  return stripLineBreaks(text).replace(/ {2,}/g, ' ').trim();
}

// ---- Phone -----------------------------------------------------------------------------------

/** Digits only; drops the Mexican country prefix (52 / 521) when the rest is a 10-digit number. */
export function normalizePhone(text: string): string {
  const digits = text.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('52')) return digits.slice(2);
  if (digits.length === 13 && digits.startsWith('521')) return digits.slice(3);
  return digits;
}

/** "(667) 351-8806" for 10-digit numbers; anything else (legacy values included) is returned untouched. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === PHONE_DIGITS ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : raw;
}

/** Keeps only phone characters (digits, spaces, parentheses, + and -) and drops every digit after the 10th. Safe on every keystroke. */
export function sanitizePhoneInput(text: string): string {
  let digits = 0;
  return text.replace(/[^\d\s()+-]/g, '').replace(/\d/g, (digit) => (++digits <= PHONE_DIGITS ? digit : ''));
}

/** Pasted text: a valid 10-digit number (with or without 52 / 521) is shown formatted; the rest is kept so the length error can say what is wrong. */
export function phoneFromPaste(text: string): string {
  const filtered = text.replace(/[^\d\s()+-]/g, '').trim();
  const digits = normalizePhone(filtered);
  if (digits.length === PHONE_DIGITS) return formatPhone(digits);
  return filtered.length > PHONE_MAX_LENGTH ? digits.slice(0, PHONE_DIGITS) : filtered;
}

/** Value to persist: the 10 normalized digits when valid, otherwise the trimmed text so legacy data is never rewritten. */
export function phoneForStorage(text: string): string {
  const digits = normalizePhone(text);
  return digits.length === PHONE_DIGITS ? digits : text.trim();
}

export function validatePhone(text: string, required: boolean = false): FieldResult {
  if (!/^[\d\s()+-]*$/.test(text)) return fail('El teléfono solo puede llevar números, espacios, paréntesis, + y -.');
  const digits = normalizePhone(text);
  if (digits.length === 0) return required ? fail('Escribe un teléfono de 10 dígitos.') : OK;
  if (digits.length < PHONE_DIGITS) {
    const missing = PHONE_DIGITS - digits.length;
    return fail(`Faltan ${missing} ${missing === 1 ? 'dígito' : 'dígitos'} (lleva ${digits.length} de ${PHONE_DIGITS}).`);
  }
  if (digits.length > PHONE_DIGITS) {
    const extra = digits.length - PHONE_DIGITS;
    return fail(`Sobran ${extra} ${extra === 1 ? 'dígito' : 'dígitos'} (lleva ${digits.length} de ${PHONE_DIGITS}).`);
  }
  return OK;
}

// ---- Email -----------------------------------------------------------------------------------

export function normalizeEmail(text: string): string {
  return text.trim().toLowerCase();
}

export function validateEmail(text: string): FieldResult {
  const email = normalizeEmail(text);
  if (!email) return OK;
  if (/\s/.test(email) || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return fail('Escribe un correo válido, por ejemplo nombre@dominio.com.');
  return OK;
}

// ---- Contact (phone or email) ----------------------------------------------------------------

export const CONTACT_REQUIRED_MESSAGE = 'Agrega un teléfono o un correo';

export interface ContactInput { telefono: string; correo: string }
export interface ContactResult { telefono: FieldResult; correo: FieldResult }
export interface ContactStatus {
  /** The phone is complete and valid, so it counts as a contact medium. An incomplete phone does not. */
  telefono: boolean;
  /** The email is non-empty and valid. */
  correo: boolean;
}

/** Which of the two fields currently counts as a valid contact medium. */
export function contactStatus({ telefono, correo }: ContactInput): ContactStatus {
  return {
    telefono: normalizePhone(telefono).length > 0 && validatePhone(telefono).ok,
    correo: normalizeEmail(correo).length > 0 && validateEmail(correo).ok,
  };
}

/** True when at least one of phone/email is a valid contact medium. */
export function hasContactMedium(input: ContactInput): boolean {
  const status = contactStatus(input);
  return status.telefono || status.correo;
}

/**
 * Single rule for "at least one contact medium". A field's own error (incomplete phone, invalid email) always wins;
 * both empty marks both fields with the same message. Never touches stored data: legacy customers without contact
 * are only held to this when they are edited or used in a new quotation.
 */
export function validateContact(input: ContactInput): ContactResult {
  const telefono = validatePhone(input.telefono);
  const correo = validateEmail(input.correo);
  const bothEmpty = telefono.ok && correo.ok && normalizePhone(input.telefono) === '' && normalizeEmail(input.correo) === '';
  if (bothEmpty) return { telefono: fail(CONTACT_REQUIRED_MESSAGE), correo: fail(CONTACT_REQUIRED_MESSAGE) };
  return { telefono, correo };
}

/** "Opcional" shows on a field only when the other one is already a valid medium and this one is empty. */
export function showOptionalHint(field: 'telefono' | 'correo', input: ContactInput): boolean {
  const status = contactStatus(input);
  const other = field === 'telefono' ? status.correo : status.telefono;
  const empty = field === 'telefono' ? input.telefono === '' : input.correo === '';
  return other && empty;
}

// ---- Plates ----------------------------------------------------------------------------------

/** Plates are saved uppercase, single-line. */
export function normalizePlates(text: string): string {
  return sanitizeSingleLine(text).toLocaleUpperCase('es-MX');
}

/** While typing: uppercase and only letters, digits, hyphen and space. */
export function sanitizePlatesInput(text: string): string {
  return stripLineBreaks(text).toLocaleUpperCase('es-MX').replace(/[^\p{L}\d\- ]/gu, '');
}

export function validatePlates(text: string): FieldResult {
  const plates = normalizePlates(text);
  if (!plates) return OK;
  if (!/^[\p{L}\d\- ]+$/u.test(plates)) return fail('Las placas solo pueden llevar letras, números, guiones y espacios.');
  if (plates.length < PLATES_MIN_LENGTH) return fail(`Las placas deben tener al menos ${PLATES_MIN_LENGTH} caracteres.`);
  return OK;
}

// ---- Year ------------------------------------------------------------------------------------

export function validateYear(year: number): FieldResult {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return fail(`Elige un año entre ${MIN_YEAR} y ${MAX_YEAR}.`);
  return OK;
}

// ---- Quantity --------------------------------------------------------------------------------

/** Parts are whole units (>= 1). Labor/service rows accept up to 2 decimals and must be > 0. */
export function validateQuantity(quantity: number, tipo: 'part' | 'labor' | string): FieldResult {
  if (!Number.isFinite(quantity)) return fail('Escribe una cantidad.');
  if (tipo === 'part') {
    if (!Number.isInteger(quantity) || quantity < 1) return fail('La cantidad de una refacción debe ser un número entero de 1 o más.');
    return OK;
  }
  if (quantity <= 0) return fail('La cantidad debe ser mayor que cero.');
  if (Math.abs(Math.round(quantity * 100) - quantity * 100) > 1e-6) return fail('La cantidad admite máximo 2 decimales.');
  return OK;
}

// ---- Amounts ---------------------------------------------------------------------------------

export const NEGATIVE_AMOUNT_MESSAGE = 'No se permiten montos negativos.';
const INVALID_AMOUNT_MESSAGE = 'Escribe un monto válido, por ejemplo 1234.56.';

/**
 * Strict money parser for submit. Accepts "1234.56", "1,234.56", "$1,234.56" and spaces. Anything else
 * (letters, several dots, misplaced commas, negatives) is an error, never NaN or a silent 0.
 */
export function parseDecimalStrict(text: string): DecimalResult {
  const compact = text.replace(/[\s$]/g, '');
  if (compact === '') return { ok: false, mensaje: 'Escribe un monto.' };
  if (compact.includes('-')) return { ok: false, mensaje: NEGATIVE_AMOUNT_MESSAGE };
  if (!/^(\d{1,3}(,\d{3})+|\d*)(\.\d+)?$/.test(compact) || !/\d/.test(compact)) return { ok: false, mensaje: INVALID_AMOUNT_MESSAGE };
  const texto = compact.replace(/,/g, '');
  const valor = Number(texto);
  if (!Number.isFinite(valor)) return { ok: false, mensaje: INVALID_AMOUNT_MESSAGE };
  return { ok: true, valor, texto };
}

/** Keeps what a money field may contain while typing or pasting (digits, separators, $, spaces and a minus so negatives can be reported). */
export function sanitizeMoneyInput(text: string): string {
  return stripLineBreaks(text).replace(/[^\d.,$\s-]/g, '');
}

/** Numeric value of a money field for live totals and saving: strict when valid, legacy tolerant parsing otherwise (never NaN). */
export function amountValue(text: string): number {
  const strict = parseDecimalStrict(text);
  return strict.ok ? strict.valor : parseDecimal(text);
}
