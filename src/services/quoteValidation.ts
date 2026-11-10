import type { QuoteDraftItem, QuoteFormData } from '../models/quoteDraft';
import type { QuotationTotals } from '../utils/quotation';
import { formatMoney } from '../utils/money';
import { MAX_CONCEPT_AMOUNT, roundCurrency, validateDiscount } from '../utils/quotation';
import { MAX_CONCEPTS } from './quotationLayout';
import { parseDecimalStrict, validatePhone, validateQuantity, validateYear } from '../validation/fields';

export const MAX_CONCEPTS_MESSAGE = `Máximo ${MAX_CONCEPTS} conceptos por cotización. Divídela en dos.`;
export const MAX_CONCEPT_AMOUNT_MESSAGE = `El monto máximo por concepto es ${formatMoney(MAX_CONCEPT_AMOUNT)}.`;

export function validateQuoteForm(form: QuoteFormData, totals: QuotationTotals): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.customerName.trim()) errors.customerName = 'Escribe el nombre completo.';
  const phone = validatePhone(form.phone);
  if (!phone.ok) errors.phone = phone.mensaje ?? 'Escribe un teléfono válido.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Escribe un correo válido.';
  if (!form.make.trim()) errors.make = 'Selecciona o escribe una marca.';
  if (!form.model.trim()) errors.model = 'Selecciona o escribe un modelo.';
  if (form.year) {
    const year = validateYear(Number(form.year));
    if (!year.ok) errors.year = year.mensaje ?? 'Elige un año válido.';
  }
  const laborRaw = form.laborAmount ?? '';
  let labor = 0;
  if (laborRaw.trim() !== '') {
    const parsed = parseDecimalStrict(laborRaw);
    if (!parsed.ok) errors.laborAmount = parsed.mensaje;
    else if (parsed.valor > MAX_CONCEPT_AMOUNT) errors.laborAmount = MAX_CONCEPT_AMOUNT_MESSAGE;
    else labor = parsed.valor;
  }
  const quantityOf = (text: string) => (text.trim() === '' ? Number.NaN : Number(text));
  const hasValidItem = form.items.some((item) => item.description.trim() && validateQuantity(quantityOf(item.quantity), item.type).ok && parseDecimalStrict(item.unitPrice).ok);
  if (form.items.length > MAX_CONCEPTS) errors.items = MAX_CONCEPTS_MESSAGE;
  else if (!hasValidItem && !(labor > 0)) errors.items = 'Agrega al menos un concepto válido.';
  form.items.forEach((item) => {
    const isBlankRow = !item.description.trim() && !String(item.unitPrice).trim();
    if (isBlankRow && labor > 0 && hasValidItem === false) return;
    if (!item.description.trim()) errors[`item-${item.id}-description`] = 'Escribe una descripción.';
    const quantity = validateQuantity(quantityOf(item.quantity), item.type);
    if (!quantity.ok) errors[`item-${item.id}-quantity`] = quantity.mensaje ?? 'Escribe una cantidad válida.';
    const price = parseDecimalStrict(item.unitPrice);
    if (!price.ok) errors[`item-${item.id}-unitPrice`] = price.mensaje;
    else if (price.valor > MAX_CONCEPT_AMOUNT || roundCurrency(Number(item.quantity) * price.valor) > MAX_CONCEPT_AMOUNT) errors[`item-${item.id}-unitPrice`] = MAX_CONCEPT_AMOUNT_MESSAGE;
  });
  const discountError = validateDiscount(totals.subtotalManoObra, form.laborDiscountType, Number(form.laborDiscountValue));
  if (form.laborDiscountValue.trim() === '' || discountError) errors.laborDiscountValue = discountError ?? 'Escribe un descuento válido.';
  if (!['7', '15', '30'].includes(form.validityDays)) errors.validityDays = 'Selecciona 7, 15 o 30 días.';
  return errors;
}

/** Canonical money text ("$1,234.56" -> "1234.56") for the fields that parse; invalid text is left as typed so its error can show. */
export function normalizeQuoteForm(form: QuoteFormData): QuoteFormData {
  const money = (text: string) => {
    const parsed = parseDecimalStrict(text);
    return parsed.ok ? parsed.texto : text;
  };
  return {
    ...form,
    laborAmount: money(form.laborAmount ?? ''),
    items: form.items.map((item): QuoteDraftItem => ({ ...item, unitPrice: money(item.unitPrice) })),
  };
}
