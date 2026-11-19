import type { QuoteDraftItem, QuoteFormData } from '../models/quoteDraft';
import type { QuotationTotals } from '../utils/quotation';
import { formatMoney } from '../utils/money';
import { MAX_CONCEPT_AMOUNT, roundCurrency, validateDiscount } from '../utils/quotation';
import { MAX_CONCEPTS } from './quotationLayout';
import { isLaborRow } from './quoteLaborRows';
import { normalizeEmail, normalizePlates, parseDecimalStrict, sanitizeSingleLine, validateContact, validatePlates, validateQuantity, validateYear } from '../validation/fields';

export const MAX_CONCEPTS_MESSAGE = `Máximo ${MAX_CONCEPTS} conceptos por cotización. Divídela en dos.`;
export const LABOR_PRICE_REQUIRED_MESSAGE = 'Escribe el precio de la mano de obra o quítala';
export const MAX_CONCEPT_AMOUNT_MESSAGE = `El monto máximo por concepto es ${formatMoney(MAX_CONCEPT_AMOUNT)}.`;

export function validateQuoteForm(form: QuoteFormData, totals: QuotationTotals): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.customerName.trim()) errors.customerName = 'Escribe el nombre completo.';
  const contact = validateContact({ telefono: form.phone, correo: form.email });
  if (!contact.telefono.ok) errors.phone = contact.telefono.mensaje ?? 'Escribe un teléfono válido.';
  if (!contact.correo.ok) errors.email = contact.correo.mensaje ?? 'Escribe un correo válido.';
  if (!form.make.trim()) errors.make = 'Selecciona o escribe una marca.';
  if (!form.model.trim()) errors.model = 'Selecciona o escribe un modelo.';
  const plates = form.plates.trim() ? validatePlates(form.plates) : { ok: false, mensaje: 'Escribe las placas.' };
  if (!plates.ok) errors.plates = plates.mensaje ?? 'Escribe unas placas válidas.';
  if (!form.year.trim()) {
    errors.year = 'Selecciona o escribe un año.';
  } else {
    const year = validateYear(Number(form.year));
    if (!year.ok) errors.year = year.mensaje ?? 'Elige un año válido.';
  }
  const quantityOf = (text: string) => (text.trim() === '' ? Number.NaN : Number(text));
  const services = form.items.filter((item) => !isLaborRow(item));
  const laborRows = form.items.filter(isLaborRow);
  const hasValidService = services.some((item) => item.description.trim() && validateQuantity(quantityOf(item.quantity), item.type).ok && parseDecimalStrict(item.unitPrice).ok);
  const hasLabor = laborRows.some((item) => { const price = parseDecimalStrict(item.unitPrice); return price.ok && price.valor > 0; });
  if (form.items.length > MAX_CONCEPTS) errors.items = MAX_CONCEPTS_MESSAGE;
  else if (!hasValidService && !hasLabor) errors.items = 'Agrega al menos un concepto válido.';
  form.items.forEach((item) => {
    if (isLaborRow(item)) {
      const price = parseDecimalStrict(item.unitPrice);
      if (item.unitPrice.trim() === '') errors[`item-${item.id}-unitPrice`] = LABOR_PRICE_REQUIRED_MESSAGE;
      else if (!price.ok) errors[`item-${item.id}-unitPrice`] = price.mensaje;
      else if (price.valor > MAX_CONCEPT_AMOUNT) errors[`item-${item.id}-unitPrice`] = MAX_CONCEPT_AMOUNT_MESSAGE;
      return;
    }
    const isBlankRow = !item.description.trim() && !String(item.unitPrice).trim();
    if (isBlankRow && hasLabor && !hasValidService) return;
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

/** Canonical form for validating and saving: single-line text cleaned, email lowercased, money text ("$1,234.56" -> "1234.56") parsed when valid (invalid text is left as typed so its error can show). */
export function normalizeQuoteForm(form: QuoteFormData): QuoteFormData {
  const money = (text: string) => {
    const parsed = parseDecimalStrict(text);
    return parsed.ok ? parsed.texto : text;
  };
  return {
    ...form,
    customerName: sanitizeSingleLine(form.customerName),
    email: normalizeEmail(sanitizeSingleLine(form.email)),
    make: sanitizeSingleLine(form.make),
    model: sanitizeSingleLine(form.model),
    plates: normalizePlates(form.plates),
    items: form.items.map((item): QuoteDraftItem => ({ ...item, description: sanitizeSingleLine(item.description), unitPrice: money(item.unitPrice) })),
  };
}
