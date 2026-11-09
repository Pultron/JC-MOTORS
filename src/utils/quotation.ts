import type {
  DiscountType,
  PublicQuotation,
  Quotation,
  QuotationItem,
} from '../models/quotation';

import { roundCurrency } from './money';

export const IVA_RATE = 0.16;

/** Highest amount accepted for a single concept (unit price, labor or quantity x price). */
export const MAX_CONCEPT_AMOUNT = 9_999_999.99;

export const AMOUNT_TOO_LARGE_MESSAGE = 'El monto es demasiado grande';

/** Thrown when a quotation amount cannot be represented exactly in integer cents. */
export class QuotationAmountError extends Error {
  constructor(message = AMOUNT_TOO_LARGE_MESSAGE) {
    super(message);
    this.name = 'QuotationAmountError';
  }
}

/** Stored items: the rounded amount is always derived from quantity x unit price. */
export function buildQuotationItems(items: Array<Omit<QuotationItem, 'amount'>>): QuotationItem[] {
  return items.map((item) => ({ ...item, amount: roundCurrency(item.quantity * item.saleUnitPrice) }));
}

/** How many concepts were explicitly priced at $0.00 (allowed, e.g. courtesy items). */
export function countZeroPriceItems(items: Array<{ saleUnitPrice: number }>): number {
  return items.filter((item) => item.saleUnitPrice === 0).length;
}

/** Same guard as profitCalculationService: cents must be safe integers. */
function assertSafeCents(amount: number): number {
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) throw new QuotationAmountError();
  return amount;
}

export interface QuotationTotals {
  subtotalRefacciones: number;
  subtotalManoObra: number;
  laborDiscount: number;
  subtotalNeto: number;
  ivaAmount: number;
  total: number;
}

export function calculateQuotationTotals(
  items: Pick<QuotationItem, 'type' | 'quantity' | 'saleUnitPrice'>[],
  laborDiscountType: DiscountType,
  laborDiscountValue: number,
  includeVat: boolean,
): QuotationTotals {
  const subtotalRefacciones = roundCurrency(items
    .filter((item) => item.type === 'part')
    .reduce((sum, item) => sum + roundCurrency(item.quantity * item.saleUnitPrice), 0));
  const subtotalManoObra = roundCurrency(items
    .filter((item) => item.type === 'labor')
    .reduce((sum, item) => sum + roundCurrency(item.quantity * item.saleUnitPrice), 0));
  const laborDiscount = calculateDiscount(subtotalManoObra, laborDiscountType, laborDiscountValue);
  const subtotalNeto = roundCurrency(subtotalRefacciones + subtotalManoObra - laborDiscount);
  const ivaAmount = includeVat ? roundCurrency(subtotalNeto * IVA_RATE) : 0;

  const total = roundCurrency(subtotalNeto + ivaAmount);
  // Item amounts feed the subtotals, so an unsafe item always surfaces in one of these figures.
  [subtotalRefacciones, subtotalManoObra, laborDiscount, subtotalNeto, ivaAmount, total].forEach(assertSafeCents);

  return { subtotalRefacciones, subtotalManoObra, laborDiscount, subtotalNeto, ivaAmount, total };
}

export function calculateDiscount(subtotal: number, type: DiscountType, value: number): number {
  const safeSubtotal = Math.max(0, subtotal);
  const safeValue = Math.max(0, Number.isFinite(value) ? value : 0);
  const discount = type === 'percentage' ? safeSubtotal * Math.min(safeValue, 100) / 100 : safeValue;
  return roundCurrency(Math.min(safeSubtotal, discount));
}

export function validateDiscount(
  subtotal: number,
  type: DiscountType,
  value: number,
): string | undefined {
  if (!Number.isFinite(value) || value < 0) return 'El descuento debe ser cero o mayor.';
  if (type === 'fixed' && subtotal <= 0 && value > 0) return 'No hay mano de obra a la que aplicar el descuento.';
  if (type === 'percentage' && value > 100) return 'El porcentaje debe estar entre 0 y 100.';
  if (type === 'fixed' && value > subtotal) return 'El descuento no puede superar el subtotal de mano de obra.';
  return undefined;
}

export function calculateRealUnitCost(
  supplierUnitCost: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  const discount = discountType === 'percentage'
    ? supplierUnitCost * discountValue / 100
    : discountValue;
  return roundCurrency(Math.max(0, supplierUnitCost - discount));
}

export function toPublicQuotation(quotation: Quotation): PublicQuotation {
  const totals = calculateQuotationTotals(
    quotation.items,
    quotation.laborDiscountType,
    quotation.laborDiscountValue,
    quotation.includeVat,
  );

  return {
    businessName: 'JC Motors',
    folio: quotation.folio,
    createdAt: quotation.createdAt,
    customer: { ...quotation.customer },
    vehicle: { ...quotation.vehicle },
    items: quotation.items.map(({ id, type, description, quantity, saleUnitPrice, amount }) => ({
      id,
      type,
      description,
      quantity,
      saleUnitPrice,
      amount,
    })),
    laborDiscount: totals.laborDiscount,
    ...(quotation.laborDiscountType === 'percentage' ? { laborDiscountPercent: quotation.laborDiscountValue } : {}),
    subtotalRefacciones: totals.subtotalRefacciones,
    subtotalManoObra: totals.subtotalManoObra,
    subtotalNeto: totals.subtotalNeto,
    includeVat: quotation.includeVat,
    ivaAmount: totals.ivaAmount,
    total: totals.total,
    validityDays: quotation.validityDays,
    publicNotes: quotation.publicNotes,
    customerNotes: quotation.customerNotes,
  };
}


export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `quotation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export { roundCurrency };
