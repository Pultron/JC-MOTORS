import type { InternalControlRecord, Quotation, QuotationItem } from '../models/quotation';
import { calculateQuotationTotals, calculateRealUnitCost, roundCurrency } from './quotation';

export interface InternalQuotationTotals {
  subtotalRefacciones: number;
  subtotalManoObra: number;
  laborDiscount: number;
  incomeBeforeVat: number;
  ivaAmount: number;
  customerTotal: number;
  realPartCost: number | undefined;
  grossMargin: number | undefined;
  amountReceived: number;
  balanceDue: number;
}

export function calculateInternalTotals(
  quotation: Quotation,
  record: InternalControlRecord,
): InternalQuotationTotals {
  const publicTotals = calculateQuotationTotals(
    quotation.items,
    quotation.laborDiscountType,
    quotation.laborDiscountValue,
    quotation.includeVat,
  );
  const costsByItem = new Map(record.partCosts.map((cost) => [cost.quotationItemId, cost]));
  const partItems = quotation.items.filter((item) => item.type === 'part');
  const hasAllPartCosts = partItems.every((item) => costsByItem.has(item.id));
  const capturedPartCost = roundCurrency(partItems
    .reduce((sum, item) => {
      const cost = costsByItem.get(item.id);
      if (!cost) return sum;
      const unitCost = calculateRealUnitCost(cost.supplierUnitCost, cost.supplierDiscountType, cost.supplierDiscountValue);
      return sum + roundCurrency(unitCost * item.quantity);
    }, 0));
  const amountReceived = record.amountReceived;

  return {
    subtotalRefacciones: publicTotals.subtotalRefacciones,
    subtotalManoObra: publicTotals.subtotalManoObra,
    laborDiscount: publicTotals.laborDiscount,
    incomeBeforeVat: publicTotals.subtotalNeto,
    ivaAmount: publicTotals.ivaAmount,
    customerTotal: publicTotals.total,
    realPartCost: hasAllPartCosts ? capturedPartCost : undefined,
    grossMargin: hasAllPartCosts ? roundCurrency(publicTotals.subtotalNeto - capturedPartCost) : undefined,
    amountReceived,
    balanceDue: roundCurrency(publicTotals.total - amountReceived),
  };
}

export function allocateLaborDiscount(
  items: QuotationItem[],
  laborDiscount: number,
): Map<string, number> {
  const laborItems = items.filter((item) => item.type === 'labor');
  const subtotal = laborItems.reduce((sum, item) => sum + item.amount, 0);
  const allocations = new Map<string, number>();
  let allocated = 0;

  laborItems.forEach((item, index) => {
    const amount = index === laborItems.length - 1
      ? roundCurrency(laborDiscount - allocated)
      : subtotal > 0 ? roundCurrency(laborDiscount * item.amount / subtotal) : 0;
    allocations.set(item.id, amount);
    allocated += amount;
  });

  return allocations;
}
