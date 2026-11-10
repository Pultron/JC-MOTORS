import type { CreateQuotationInput, PublicQuotation, Quotation } from '../models/quotation';
import type { QuoteFormData } from '../models/quoteDraft';
import { parseDecimal } from '../utils/currency';
import { phoneForStorage } from '../validation/fields';
import { buildQuotationItems, createId, toPublicQuotation } from '../utils/quotation';

/** Numeric field coming from a text input; unparsable text counts as 0 so the preview never breaks. */
const num = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Single place that turns the "Nueva cotización" form into the repository input. Both the real save
 * and the live sheet-count preview go through it, so they cannot drift apart.
 */
export function buildQuotationInput(form: QuoteFormData, preferredFolio?: string): CreateQuotationInput {
  const labor = parseDecimal(form.laborAmount);
  return {
    ...(preferredFolio ? { preferredFolio } : {}),
    ...(form.customerId ? { customerId: form.customerId } : {}),
    customer: { name: form.customerName.trim(), phone: phoneForStorage(form.phone), ...(form.email.trim() ? { email: form.email.trim() } : {}) },
    vehicle: { make: form.make.trim(), model: form.model.trim(), ...(form.year ? { year: Number(form.year) } : {}), plates: form.plates.trim().toUpperCase() },
    items: [
      ...form.items
        .filter((item) => item.description.trim() || String(item.unitPrice).trim())
        .map((item) => ({ id: item.id, type: item.type, description: item.description.trim(), quantity: num(item.quantity), saleUnitPrice: num(item.unitPrice) })),
      ...(labor > 0 ? [{ id: createId(), type: 'labor' as const, description: 'Mano de obra', quantity: 1, saleUnitPrice: labor }] : []),
    ],
    laborDiscountType: form.laborDiscountType,
    laborDiscountValue: num(form.laborDiscountValue),
    includeVat: form.ivaEnabled,
    validityDays: num(form.validityDays) || 15,
    publicNotes: form.publicNotes.trim(),
    customerNotes: form.customerNotes.trim(),
  };
}

/**
 * The customer-facing quotation the PDF would print for this form right now. Uses the same item
 * builder (rounded amounts) and toPublicQuotation/calculateQuotationTotals as the saved quotation.
 * Throws QuotationAmountError when the amounts are too large.
 */
export function previewPublicQuotation(form: QuoteFormData, now: Date = new Date()): PublicQuotation {
  const input = buildQuotationInput(form);
  const quotation: Quotation = {
    id: 'preview',
    folio: 'JC-0000',
    createdAt: now.toISOString(),
    customer: input.customer,
    vehicle: input.vehicle,
    items: buildQuotationItems(input.items),
    laborDiscountType: input.laborDiscountType,
    laborDiscountValue: input.laborDiscountValue,
    includeVat: input.includeVat,
    validityDays: input.validityDays,
    publicNotes: input.publicNotes,
    customerNotes: input.customerNotes ?? '',
    status: 'Pendiente',
  };
  return toPublicQuotation(quotation);
}
