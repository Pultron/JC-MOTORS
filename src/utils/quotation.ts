import type {
  DiscountType,
  PublicQuotation,
  Quotation,
  QuotationItem,
} from '../models/quotation';

export const IVA_RATE = 0.16;

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

  return {
    subtotalRefacciones,
    subtotalManoObra,
    laborDiscount,
    subtotalNeto,
    ivaAmount,
    total: roundCurrency(subtotalNeto + ivaAmount),
  };
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
  if (subtotal <= 0 && value > 0) return 'No hay mano de obra a la que aplicar el descuento.';
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

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    currencyDisplay: 'code',
  }).format(amount);
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function getMonthKey(date: string): string {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `quotation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
