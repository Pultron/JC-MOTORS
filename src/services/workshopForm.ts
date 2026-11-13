import { ADDRESS_LINE_MAX, NAME_MAX, phoneDigits } from '../config/businessInfo';
import type { BusinessInfo } from '../config/businessInfo';
import { validateEmail, validatePhone } from '../validation/fields';
import { DEFAULT_MESSAGE_TEMPLATE } from './shareMessage';

/** Everything the "Datos del taller" page edits. The stored address is one string; the form shows two rows. */
export interface WorkshopFormValues {
  nombre: string;
  telefono: string;
  calle: string;
  colonia: string;
  correo: string;
  mensaje: string;
}

export type WorkshopFormErrors = Partial<Record<'nombre' | 'telefono' | 'calle' | 'colonia' | 'correo', string>>;

/**
 * Splits the stored address (lines separated by "\n") into the two form rows.
 * The first non-empty line is the street; any further lines are folded into the colony row so no text is lost.
 * An old single-line address goes entirely into the street row.
 */
export function splitAddress(direccion: string): { calle: string; colonia: string } {
  const lines = direccion.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  return { calle: lines[0] ?? '', colonia: lines.slice(1).join(' ') };
}

/** Inverse of splitAddress: trimmed, blank rows dropped, joined with "\n" (the stored format). */
export function joinAddress(calle: string, colonia: string): string {
  return [calle, colonia].map((part) => part.trim()).filter(Boolean).join('\n');
}

export function toFormValues(info: BusinessInfo): WorkshopFormValues {
  return {
    nombre: info.nombre,
    telefono: info.telefonos[0] ?? '',
    ...splitAddress(info.direccion),
    correo: info.correo ?? '',
    mensaje: info.mensajeClientes ?? DEFAULT_MESSAGE_TEMPLATE,
  };
}

/** Data part of the form applied over the stored info (extra phones, RFC, site and message are kept as they are). */
export function applyDatos(values: WorkshopFormValues, base: BusinessInfo): BusinessInfo {
  return {
    ...base,
    nombre: values.nombre,
    telefonos: [values.telefono, ...base.telefonos.slice(1)],
    direccion: joinAddress(values.calle, values.colonia),
    correo: values.correo,
  };
}

/** The default text counts as "no custom message", exactly as it is stored. */
const normalizeMessage = (message: string): string => {
  const trimmed = message.trim();
  return trimmed === '' ? DEFAULT_MESSAGE_TEMPLATE : trimmed;
};

/** True when `current` would change what is stored. Compares the normalized form, so stray spaces are not "changes". */
export function isDirty(saved: WorkshopFormValues, current: WorkshopFormValues): boolean {
  return saved.nombre.trim() !== current.nombre.trim()
    || phoneDigits(saved.telefono) !== phoneDigits(current.telefono)
    || saved.calle.trim() !== current.calle.trim()
    || saved.colonia.trim() !== current.colonia.trim()
    || saved.correo.trim() !== current.correo.trim()
    || normalizeMessage(saved.mensaje) !== normalizeMessage(current.mensaje);
}

/** Per-row validation of the data section. Errors are keyed by the row they belong to. */
export function validateWorkshopForm(values: WorkshopFormValues): WorkshopFormErrors {
  const errors: WorkshopFormErrors = {};
  const nombre = values.nombre.trim();
  if (!nombre) errors.nombre = 'Escribe el nombre del taller.';
  else if (nombre.length > NAME_MAX) errors.nombre = `Usa máximo ${NAME_MAX} caracteres para que quepa en el encabezado.`;
  const phone = validatePhone(values.telefono, true);
  if (!phone.ok) errors.telefono = phone.mensaje;
  const calle = values.calle.trim();
  if (!calle) errors.calle = 'Escribe la calle y el número.';
  else if (calle.length > ADDRESS_LINE_MAX) errors.calle = `Admite máximo ${ADDRESS_LINE_MAX} caracteres.`;
  const colonia = values.colonia.trim();
  if (!colonia) errors.colonia = 'Escribe la colonia y la ciudad.';
  else if (colonia.length > ADDRESS_LINE_MAX) errors.colonia = `Admite máximo ${ADDRESS_LINE_MAX} caracteres.`;
  if (values.correo.trim()) {
    const email = validateEmail(values.correo);
    if (!email.ok) errors.correo = email.mensaje;
  }
  return errors;
}
