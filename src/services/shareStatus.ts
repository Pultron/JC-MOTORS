import type { Quotation } from '../models/quotation';
import { formatDate, formatTime12 } from '../utils/dateFormat';

export type ShareRecord = Pick<Quotation, 'sharedAt' | 'sharedVia'>;

export type ShareStatus =
  | { kind: 'none' }
  | { kind: 'shared'; medium: 'whatsapp' | 'email'; sharedAt: string };

const CHANNEL_VISIBLE = { whatsapp: 'WhatsApp', email: 'Correo' } as const;
const CHANNEL_SPOKEN = { whatsapp: 'WhatsApp', email: 'correo' } as const;

export const NOT_SHARED_TEXT = 'Sin compartir';

/** A record only counts when it has a known channel and a parsable date. */
export function shareStatusOf(record: ShareRecord): ShareStatus {
  if (!record.sharedAt || !record.sharedVia || !formatDate(record.sharedAt, 'iso')) return { kind: 'none' };
  return { kind: 'shared', medium: record.sharedVia, sharedAt: record.sharedAt };
}

/** Visible second line: "WhatsApp · 12 nov, 6:48 p.m." or "Sin compartir". */
export function shareLineText(record: ShareRecord, now: Date = new Date()): string {
  const status = shareStatusOf(record);
  if (status.kind === 'none') return NOT_SHARED_TEXT;
  return `${CHANNEL_VISIBLE[status.medium]} · ${formatDate(status.sharedAt, 'sharedShort', now)}`;
}

/** Spoken label: "Yarely, compartida por WhatsApp el 12 de noviembre de 2026 a las 6:48 p.m." */
export function shareAccessibleLabel(customerName: string, record: ShareRecord): string {
  const name = customerName.trim();
  const status = shareStatusOf(record);
  const text = status.kind === 'none'
    ? 'sin compartir'
    : `compartida por ${CHANNEL_SPOKEN[status.medium]} el ${formatDate(status.sharedAt, 'long')} a las ${formatTime12(status.sharedAt)}`;
  return name ? `${name}, ${text}` : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
