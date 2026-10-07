import type { InternalCaptureStatus, InternalCostRecord } from '../models/internalCosts';
import type { Quotation } from '../models/quotation';
import { toCents } from '../utils/currencyUtils';

export function calculateProfit(quote: Quotation, record?: InternalCostRecord) {
  let parts = 0;
  let labor = 0;
  for (const item of quote.items) {
    const amount = Math.round(toCents(item.saleUnitPrice) * item.quantity);
    if (item.type === 'part') parts += amount;
    else labor += amount;
  }
  const discount = quote.laborDiscountType === 'percentage'
    ? Math.round(labor * Math.min(100, quote.laborDiscountValue) / 100)
    : toCents(quote.laborDiscountValue);
  const soldTotalCents = parts + labor - Math.min(labor, Math.max(0, discount));
  const costs = new Map(record?.itemCosts.map(cost => [cost.quoteItemId, cost.actualUnitCostCents]));
  const items = quote.items.filter(item => item.type === 'part').map(item => {
    const actualUnitCostCents = costs.get(item.id) ?? null;
    const customerTotalCents = Math.round(toCents(item.saleUnitPrice) * item.quantity);
    const actualTotalCostCents = actualUnitCostCents === null ? null : Math.round(actualUnitCostCents * item.quantity);
    return { ...item, actualUnitCostCents, customerTotalCents, actualTotalCostCents,
      profitCents: actualTotalCostCents === null ? null : customerTotalCents - actualTotalCostCents };
  });
  const spentTotalCents = items.reduce((sum, item) => sum + (item.actualTotalCostCents ?? 0), 0)
    + (record?.additionalExpenses.reduce((sum, expense) => sum + expense.amountCents, 0) ?? 0);
  const profitCents = soldTotalCents - spentTotalCents;
  if (![soldTotalCents, spentTotalCents, profitCents].every(Number.isSafeInteger)) throw new Error('Los totales exceden el límite permitido.');
  const captured = items.filter(item => item.actualUnitCostCents !== null).length;
  const started = captured > 0 || Boolean(record?.additionalExpenses.length);
  const status: InternalCaptureStatus = captured === items.length ? 'complete' : started ? 'incomplete' : 'pending';
  return { items, soldTotalCents, spentTotalCents, profitCents, status,
    marginPercentage: soldTotalCents === 0 ? 0 : profitCents / soldTotalCents * 100 };
}

export type QuoteProfit = ReturnType<typeof calculateProfit>;
