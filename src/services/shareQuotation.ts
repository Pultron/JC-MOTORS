import type { CustomerProfile, Quotation, ShareMedium } from '../models/quotation';
import { formatDate } from '../utils/dateFormat';
import { normalizeEmail, normalizePhone, PHONE_DIGITS, validateEmail, validatePhone } from '../validation/fields';

// ---- URLs ------------------------------------------------------------------------------------------------------
// The native commands (src-tauri/src/share.rs) build these same URLs from RAW text. These pure builders mirror them
// exactly: they are used for previews/tests and as the fallback in a plain browser. Never double-encode: when going
// through Tauri, pass the raw text and never one of these URLs.

/** RFC 3986 unreserved set only (letters, digits and `-._~`), like `percent_encode` in share.rs. */
export function percentEncode(text: string): string {
  return encodeURIComponent(text).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export class ShareInputError extends Error {}

/** The 10 national digits of a phone ("+52 (667) 123-4567" included), or throws. */
export function whatsappDigits(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length !== PHONE_DIGITS || !validatePhone(phone).ok) throw new ShareInputError('El teléfono debe tener 10 dígitos.');
  return digits;
}

export function buildWhatsAppUrl(phone: string, text: string): string {
  return `https://wa.me/52${whatsappDigits(phone)}?text=${percentEncode(text)}`;
}

export function buildMailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${percentEncode(email.trim()).replace('%40', '@')}?subject=${percentEncode(subject)}&body=${percentEncode(body)}`;
}

export function buildGmailUrl(email: string, subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${percentEncode(email.trim())}&su=${percentEncode(subject)}&body=${percentEncode(body)}`;
}

// ---- File names ------------------------------------------------------------------------------------------------

const RESERVED_NAMES = new Set(['CON', 'PRN', 'AUX', 'NUL', ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)]);
const MAX_NAME_CHARS = 120;

/** Windows-safe file name WITHOUT extension. Mirrors `sanitize_file_base` in share.rs (the native side re-checks it). */
export function sanitizeFileBase(raw: string): string {
  const filtered = Array.from(raw).filter((char) => !/[\u0000-\u001f\u007f-\u009f]/.test(char) && !'<>:"/\\|?*'.includes(char)).join('');
  let name = filtered.split(/\s+/).filter(Boolean).join(' ');
  if (name.toLowerCase().endsWith('.pdf')) name = name.slice(0, -4);
  name = Array.from(name).slice(0, MAX_NAME_CHARS).join('').replace(/[. ]+$/, '').replace(/^\s+/, '');
  if (!name) name = 'Documento';
  const stem = (name.split('.')[0] ?? '').trimEnd().toUpperCase();
  return RESERVED_NAMES.has(stem) ? `_${name}` : name;
}

/** "Cotización JC-0005 - Nombre Cliente" (just the folio part when the customer has no name). */
export function sharedFilenameBase(folio: string, customerName: string): string {
  const name = customerName.trim();
  return sanitizeFileBase(name ? `Cotización ${folio} - ${name}` : `Cotización ${folio}`);
}

// ---- Contact media ---------------------------------------------------------------------------------------------

export interface ShareContact {
  phone: string;
  email: string;
}

const ASCII_PRINTABLE = /^[\x21-\x7e]+$/;

/** A phone that WhatsApp can use: a complete 10-digit number. */
export function hasWhatsAppMedium(contact: ShareContact): boolean {
  const digits = normalizePhone(contact.phone);
  return digits.length === PHONE_DIGITS && validatePhone(contact.phone).ok;
}

/** An email the native side will accept (valid and plain ASCII, like `validate_email` in share.rs). */
export function hasEmailMedium(contact: ShareContact): boolean {
  const email = normalizeEmail(contact.email);
  return email.length > 0 && validateEmail(contact.email).ok && ASCII_PRINTABLE.test(email);
}

export const hasMedium = (medium: ShareMedium, contact: ShareContact): boolean => (medium === 'whatsapp' ? hasWhatsAppMedium(contact) : hasEmailMedium(contact));
export const otherMedium = (medium: ShareMedium): ShareMedium => (medium === 'whatsapp' ? 'email' : 'whatsapp');

export type ShareStep =
  | { kind: 'ready' }
  /** The chosen medium is missing: ask for it. `alternative` is the other medium when the customer has it ("Enviar por … en su lugar"). */
  | { kind: 'missing'; medium: ShareMedium; alternative: ShareMedium | null };

/** Which dialog (if any) the flow needs before generating anything. */
export function decideShareStep(medium: ShareMedium, contact: ShareContact): ShareStep {
  if (hasMedium(medium, contact)) return { kind: 'ready' };
  const other = otherMedium(medium);
  return { kind: 'missing', medium, alternative: hasMedium(other, contact) ? other : null };
}

/**
 * The contact data that will actually be used: what the quotation says, completed with the saved customer record
 * (a customer edited after the quotation was written may now have the missing phone or email).
 */
export function effectiveContact(quotation: Pick<Quotation, 'customer' | 'customerId'>, customers: readonly Pick<CustomerProfile, 'id' | 'phone' | 'email'>[]): ShareContact {
  const record = quotation.customerId ? customers.find((customer) => customer.id === quotation.customerId) : undefined;
  const snapshot: ShareContact = { phone: quotation.customer.phone ?? '', email: quotation.customer.email ?? '' };
  const recorded: ShareContact = { phone: record?.phone ?? '', email: record?.email ?? '' };
  return {
    phone: hasWhatsAppMedium(snapshot) || !hasWhatsAppMedium(recorded) ? snapshot.phone : recorded.phone,
    email: hasEmailMedium(snapshot) || !hasEmailMedium(recorded) ? snapshot.email : recorded.email,
  };
}

// ---- Record ----------------------------------------------------------------------------------------------------

export const MEDIUM_LABEL: Record<ShareMedium, string> = { whatsapp: 'WhatsApp', email: 'correo' };

/** "Compartida por WhatsApp el 12 de noviembre de 2026, 5:40 p.m." — empty when it was never shared. */
export function sharedLabel(quotation: Pick<Quotation, 'sharedAt' | 'sharedVia'>): string {
  if (!quotation.sharedAt || !quotation.sharedVia) return '';
  const when = formatDate(quotation.sharedAt, 'dateTime');
  return when ? `Compartida por ${MEDIUM_LABEL[quotation.sharedVia]} el ${when}` : '';
}

// ---- Native commands -------------------------------------------------------------------------------------------

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function nativeInvoke(): Invoke | undefined {
  return typeof window === 'undefined' ? undefined : window.__TAURI__?.core.invoke;
}

export async function saveSharedPdf(invoke: Invoke, blob: Blob, filenameBase: string): Promise<string> {
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  return invoke<string>('save_shared_pdf', { filenameBase, bytes });
}

export const copyFileToClipboard = (invoke: Invoke, path: string) => invoke<void>('copy_file_to_clipboard', { path });
export const revealInFolder = (invoke: Invoke, path: string) => invoke<void>('reveal_in_folder', { path });

/** Opens WhatsApp / the mail client with RAW text (Rust percent-encodes). */
export function openShareLink(invoke: Invoke, medium: ShareMedium, contact: ShareContact, message: { subject: string; text: string }): Promise<void> {
  return medium === 'whatsapp'
    ? invoke<void>('open_whatsapp', { phone: whatsappDigits(contact.phone), text: message.text })
    : invoke<void>('open_mailto', { email: contact.email.trim(), subject: message.subject, body: message.text });
}

export const openGmail = (invoke: Invoke, contact: ShareContact, message: { subject: string; text: string }) => invoke<void>('open_gmail', { email: contact.email.trim(), subject: message.subject, body: message.text });

/** Browser fallback (no Tauri): the same URLs, opened in a new tab. Returns false when the browser blocked it. */
export function openShareUrlInBrowser(medium: ShareMedium | 'gmail', contact: ShareContact, message: { subject: string; text: string }): boolean {
  const url = medium === 'whatsapp'
    ? buildWhatsAppUrl(contact.phone, message.text)
    : medium === 'gmail'
      ? buildGmailUrl(contact.email, message.subject, message.text)
      : buildMailtoUrl(contact.email, message.subject, message.text);
  return window.open(url, '_blank') !== null;
}
