import { APPROVED_STATUSES } from '../models/quotation';
import type { Quotation, QuotationStatus } from '../models/quotation';

export function isApprovedStatus(status: QuotationStatus): boolean {
  return APPROVED_STATUSES.includes(status);
}

export function expirationDate(quotation: Pick<Quotation, 'createdAt' | 'validityDays'>): Date {
  const created = new Date(quotation.createdAt);
  return new Date(created.getTime() + quotation.validityDays * 86_400_000);
}

export function nextProgressStatus(status: QuotationStatus): QuotationStatus | null {
  if (status === 'Aprobada') return 'En proceso';
  if (status === 'En proceso') return 'Terminada';
  if (status === 'Terminada') return 'Entregada';
  return null;
}
