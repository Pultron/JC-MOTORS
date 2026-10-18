import type { InternalCostRecord } from '../models/internalCosts';
import type { Quotation } from '../models/quotation';
import { calculateProfit } from './profitCalculationService';
import { toCents } from '../utils/currencyUtils';
import { getMonthKey, calculateQuotationTotals } from '../utils/quotation';
import { expirationDate, isApprovedStatus } from '../utils/quotationStatus';

export interface MonthlyReportRow {
  quotation: Quotation;
  eventAt: string;
  outcome: 'aprobada' | 'perdida';
  saleCents: number;
  spentCents: number;
  profitCents: number;
  receivedCents: number;
  provisional: boolean;
}

export function buildMonthlyReport(month: string, quotations: Quotation[], records: InternalCostRecord[]) {
  const recordMap = new Map(records.map((record) => [record.quoteId, record]));
  const rows: MonthlyReportRow[] = quotations.flatMap<MonthlyReportRow>((quotation) => {
    const approved = isApprovedStatus(quotation.status);
    const lost = quotation.status === 'Cancelada' || quotation.status === 'Vencida';
    if (!approved && !lost) return [];
    const eventAt = approved ? quotation.approvedAt ?? quotation.createdAt
      : quotation.status === 'Cancelada' ? quotation.cancelledAt ?? quotation.createdAt
        : quotation.statusUpdatedAt ?? expirationDate(quotation).toISOString();
    if (getMonthKey(eventAt) !== month) return [];
    if (!approved) return [{ quotation, eventAt, outcome: 'perdida' as const,
      saleCents: 0, spentCents: 0, profitCents: 0, receivedCents: 0, provisional: false }];
    const record = recordMap.get(quotation.id);
    const profit = calculateProfit(quotation, record);
    const saleCents = toCents(calculateQuotationTotals(
      quotation.items, quotation.laborDiscountType, quotation.laborDiscountValue, quotation.includeVat,
    ).total);
    return [{ quotation, eventAt, outcome: 'aprobada' as const,
      saleCents, spentCents: profit.spentTotalCents, profitCents: profit.profitCents,
      receivedCents: record?.payments.reduce((sum, payment) => sum + payment.amountCents, 0) ?? 0,
      provisional: profit.status !== 'complete' }];
  }).sort((a, b) => b.eventAt.localeCompare(a.eventAt));
  const approvedCount = rows.filter((row) => row.outcome === 'aprobada').length;
  const lostCount = rows.length - approvedCount;
  return {
    rows, approvedCount, lostCount,
    salesCents: rows.reduce((sum, row) => sum + row.saleCents, 0),
    spentCents: rows.reduce((sum, row) => sum + row.spentCents, 0),
    profitCents: rows.reduce((sum, row) => sum + row.profitCents, 0),
    receivedCents: rows.reduce((sum, row) => sum + row.receivedCents, 0),
  };
}
