import type { Quotation } from '../models/quotation';
import { formatDayMonth, formatDayMonthYearTime } from '../utils/dateFormat';
import { shareStatusOf } from './shareStatus';

/** One-tap reasons offered in the cancel dialog. */
export const CANCELLATION_REASON_SUGGESTIONS = [
  'El cliente ya no quiso el trabajo',
  'Se aprobó por error',
  'Se hará una cotización nueva',
] as const;

const MEDIUM_TEXT = { whatsapp: 'WhatsApp', email: 'correo' } as const;

/** Extra warning for the cancel dialog when the customer already received the quotation; undefined otherwise. */
export function sharedCancelNote(quotation: Quotation): string | undefined {
  const status = shareStatusOf(quotation);
  if (status.kind === 'none') return undefined;
  return `Esta cotización ya se compartió con el cliente por ${MEDIUM_TEXT[status.medium]} el ${formatDayMonth(status.sharedAt)}.`;
}

/** Row subline in the quotation tables: "Cancelada · reason", or just "Cancelada" for records without a reason. */
export function cancelledLineText(quotation: Pick<Quotation, 'cancellationReason'>): string {
  const reason = quotation.cancellationReason?.trim();
  return reason ? `Cancelada · ${reason}` : 'Cancelada';
}

/** Notice for the detail page: "Cancelada el 18 nov 2026, 11:40 p.m. · Motivo: …". Undefined when nothing is known beyond the status. */
export function cancelledNoticeText(quotation: Pick<Quotation, 'cancelledAt' | 'cancellationReason'>): string | undefined {
  const when = quotation.cancelledAt ? formatDayMonthYearTime(quotation.cancelledAt) : '';
  const reason = quotation.cancellationReason?.trim();
  if (!when && !reason) return undefined;
  const head = when ? `Cancelada el ${when}` : 'Cancelada';
  return reason ? `${head} · Motivo: ${reason}` : head;
}
