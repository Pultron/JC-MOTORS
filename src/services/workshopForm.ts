import { ADDRESS_LINE_MAX, NAME_MAX, phoneDigits } from '../config/businessInfo';
import type { BusinessInfo } from '../config/businessInfo';
import { validateEmail, validatePhone } from '../validation/fields';
import { DEFAULT_INVOICE_MESSAGE_TEMPLATE, DEFAULT_MESSAGE_TEMPLATE } from './shareMessage';

/** Everything the "Datos del taller" page edits. The stored address is one string; the form shows two rows. */
export interface WorkshopFormValues {
  nombre: string;
  telefono: string;
  calle: string;
  colonia: string;
  correo: string;
  /** Quotation message template. */
  mensaje: string;
  /** Invoice message template. */
  mensajeFacturas: string;
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
    mensajeFacturas: info.mensajeFacturas ?? DEFAULT_INVOICE_MESSAGE_TEMPLATE,
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
const normalizeMessage = (message: string, fallback: string = DEFAULT_MESSAGE_TEMPLATE): string => {
  const trimmed = message.trim();
  return trimmed === '' ? fallback : trimmed;
};

/** True when `current` would change what is stored. Compares the normalized form, so stray spaces are not "changes". */
export function isDirty(saved: WorkshopFormValues, current: WorkshopFormValues): boolean {
  return saved.nombre.trim() !== current.nombre.trim()
    || phoneDigits(saved.telefono) !== phoneDigits(current.telefono)
    || saved.calle.trim() !== current.calle.trim()
    || saved.colonia.trim() !== current.colonia.trim()
    || saved.correo.trim() !== current.correo.trim()
    || normalizeMessage(saved.mensaje) !== normalizeMessage(current.mensaje)
    || normalizeMessage(saved.mensajeFacturas, DEFAULT_INVOICE_MESSAGE_TEMPLATE) !== normalizeMessage(current.mensajeFacturas, DEFAULT_INVOICE_MESSAGE_TEMPLATE);
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

/** Replaces the selection [selStart, selEnd) with `insert` and returns the new text and the caret right after it. */
export function insertAtCursor(text: string, selStart: number, selEnd: number, insert: string): { text: string; caret: number } {
  const clamp = (value: number) => Math.min(Math.max(Number.isFinite(value) ? value : text.length, 0), text.length);
  const start = Math.min(clamp(selStart), clamp(selEnd));
  const end = Math.max(clamp(selStart), clamp(selEnd));
  return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length };
}

/** Both message templates over the stored info. The default text (or blank) is stored as "no custom message". */
export function applyMensaje(values: WorkshopFormValues, base: BusinessInfo): BusinessInfo {
  const { mensajeClientes: _previous, mensajeFacturas: _previousInvoices, ...rest } = base;
  const text = values.mensaje.trim();
  const invoiceText = values.mensajeFacturas.trim();
  return {
    ...rest,
    ...(text === '' || text === DEFAULT_MESSAGE_TEMPLATE ? {} : { mensajeClientes: values.mensaje }),
    ...(invoiceText === '' || invoiceText === DEFAULT_INVOICE_MESSAGE_TEMPLATE ? {} : { mensajeFacturas: values.mensajeFacturas }),
  };
}

/** Everything the page saves in one atomic write: data and message together. */
export function buildSaveCandidate(values: WorkshopFormValues, base: BusinessInfo): BusinessInfo {
  return applyMensaje(values, applyDatos(values, base));
}

/**
 * 'mensaje' = only the quotation message, 'mensajeFacturas' = only the invoice message,
 * 'mensajes' = both messages and no data, 'ambos' = data plus at least one message.
 */
export type ChangedSections = 'datos' | 'mensaje' | 'mensajeFacturas' | 'mensajes' | 'ambos' | 'ninguno';

/** Which part of the form differs from the saved values; drives the wording of the save toast. */
export function changedSections(saved: WorkshopFormValues, current: WorkshopFormValues): ChangedSections {
  const datos = isDirty(saved, { ...current, mensaje: saved.mensaje, mensajeFacturas: saved.mensajeFacturas });
  const cotizaciones = isDirty(saved, { ...saved, mensaje: current.mensaje });
  const facturas = isDirty(saved, { ...saved, mensajeFacturas: current.mensajeFacturas });
  if (datos && (cotizaciones || facturas)) return 'ambos';
  if (datos) return 'datos';
  if (cotizaciones && facturas) return 'mensajes';
  if (cotizaciones) return 'mensaje';
  return facturas ? 'mensajeFacturas' : 'ninguno';
}

export function saveToastCopy(sections: ChangedSections): { title: string; description: string } {
  if (sections === 'mensaje') {
    return { title: 'Mensaje para cotizaciones guardado', description: 'Se usará al enviar cotizaciones por WhatsApp o correo.' };
  }
  if (sections === 'mensajeFacturas') {
    return { title: 'Mensaje para facturas guardado', description: 'Se usará al enviar facturas por WhatsApp o correo.' };
  }
  if (sections === 'mensajes') {
    return { title: 'Mensajes guardados', description: 'Se usarán al enviar cotizaciones y facturas por WhatsApp o correo.' };
  }
  return { title: 'Datos guardados', description: 'Los cambios del taller ya están activos en tus cotizaciones.' };
}

interface NavigationTarget { pathname: string; search?: string }

/** Leaving is only "leaving" when the destination is another page; same-page updates (e.g. search params) pass. */
export function shouldBlockNavigation(dirty: boolean, current: NavigationTarget, next: NavigationTarget): boolean {
  return dirty && (current.pathname !== next.pathname || (current.search ?? '') !== (next.search ?? ''));
}
