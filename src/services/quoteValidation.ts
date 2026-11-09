import type { QuoteFormData } from '../models/quoteDraft';
import type { QuotationTotals } from '../utils/quotation';
import { formatMoney } from '../utils/money';
import { MAX_CONCEPT_AMOUNT, roundCurrency, validateDiscount } from '../utils/quotation';
import { MAX_CONCEPTS } from './quotationLayout';

export const MAX_CONCEPTS_MESSAGE = `Máximo ${MAX_CONCEPTS} conceptos por cotización. Divídela en dos.`;
export const MAX_CONCEPT_AMOUNT_MESSAGE = `El monto máximo por concepto es ${formatMoney(MAX_CONCEPT_AMOUNT)}.`;

export function validateQuoteForm(form: QuoteFormData, totals: QuotationTotals): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.customerName.trim()) errors.customerName = 'Escribe el nombre completo.';
  if (form.phone && form.phone.replace(/\D/g, '').length !== 10) errors.phone = 'Escribe un teléfono de 10 dígitos.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Escribe un correo válido.';
  if (!form.make.trim()) errors.make = 'Selecciona o escribe una marca.';
  if (!form.model.trim()) errors.model = 'Selecciona o escribe un modelo.';
  if (form.year && (!/^\d{4}$/.test(form.year) || Number(form.year) < 1886 || Number(form.year) > new Date().getFullYear() + 1)) errors.year = 'Escribe un año válido de 4 dígitos.';
  const laborRaw = form.laborAmount ?? '';
  const labor = Number(laborRaw) || 0;
  if (laborRaw.trim() !== '' && (!Number.isFinite(Number(laborRaw)) || Number(laborRaw) < 0)) errors.laborAmount = 'Debe ser cero o mayor.';
  else if (labor > MAX_CONCEPT_AMOUNT) errors.laborAmount = MAX_CONCEPT_AMOUNT_MESSAGE;
  const hasValidItem = form.items.some((item) => item.description.trim() && Number(item.quantity) > 0 && item.unitPrice !== '' && Number(item.unitPrice) >= 0);
  if (form.items.length > MAX_CONCEPTS) errors.items = MAX_CONCEPTS_MESSAGE;
  else if (!hasValidItem && !(labor > 0)) errors.items = 'Agrega al menos un concepto válido.';
  form.items.forEach((item) => {
    const isBlankRow = !item.description.trim() && !String(item.unitPrice).trim();
    if (isBlankRow && labor > 0 && hasValidItem === false) return;
    if (!item.description.trim()) errors[`item-${item.id}-description`] = 'Escribe una descripción.';
    if (!item.quantity || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) errors[`item-${item.id}-quantity`] = 'Debe ser mayor que cero.';
    if (item.unitPrice === '' || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) errors[`item-${item.id}-unitPrice`] = 'Debe ser cero o mayor.';
    else if (Number(item.unitPrice) > MAX_CONCEPT_AMOUNT || roundCurrency(Number(item.quantity) * Number(item.unitPrice)) > MAX_CONCEPT_AMOUNT) errors[`item-${item.id}-unitPrice`] = MAX_CONCEPT_AMOUNT_MESSAGE;
  });
  const discountError = validateDiscount(totals.subtotalManoObra, form.laborDiscountType, Number(form.laborDiscountValue));
  if (form.laborDiscountValue.trim() === '' || discountError) errors.laborDiscountValue = discountError ?? 'Escribe un descuento válido.';
  if (!['7', '15', '30'].includes(form.validityDays)) errors.validityDays = 'Selecciona 7, 15 o 30 días.';
  return errors;
}
