import type { Quotation } from '../models/quotation';
import type { QuoteDraftItem, QuoteFormData } from '../models/quoteDraft';
import { amountValue, parseDecimalStrict } from '../validation/fields';
import { createId } from '../utils/quotation';

/** Fixed text of every labor line. */
export const LABOR_DESCRIPTION = 'Mano de obra';

/** Draft shape written before labor became a per-service line: it still carries one "laborAmount" text. */
export type LegacyQuoteFormData = Omit<QuoteFormData, 'items'> & { items: QuoteDraftItem[]; laborAmount?: string };

export const isLaborRow = (item: Pick<QuoteDraftItem, 'type'>): boolean => item.type === 'labor';

/** Labor that hangs under a service (as opposed to the loose labor line of an old quotation). */
export const isPairedLabor = (item: QuoteDraftItem): boolean => item.type === 'labor' && Boolean(item.parentId);

export function blankItem(description = '', newId: () => string = createId): QuoteDraftItem {
  return { id: newId(), type: 'part', description, quantity: '1', unitPrice: '' };
}

export const laborOf = (items: readonly QuoteDraftItem[], serviceId: string): QuoteDraftItem | undefined =>
  items.find((item) => item.type === 'labor' && item.parentId === serviceId);

/** Inserts an empty labor line right below its service. Null when the service is missing, already has one, or the cap is reached. */
export function addLabor(items: readonly QuoteDraftItem[], serviceId: string, cap: number, newId: () => string = createId): { items: QuoteDraftItem[]; laborId: string } | null {
  const index = items.findIndex((item) => item.id === serviceId && item.type === 'part');
  if (index < 0 || laborOf(items, serviceId) || items.length >= cap) return null;
  const labor: QuoteDraftItem = { id: newId(), type: 'labor', description: LABOR_DESCRIPTION, quantity: '1', unitPrice: '', parentId: serviceId };
  return { items: [...items.slice(0, index + 1), labor, ...items.slice(index + 1)], laborId: labor.id };
}

const orBlank = (items: QuoteDraftItem[]): QuoteDraftItem[] => (items.length ? items : [blankItem()]);

/** Removes only this labor line. */
export const removeLabor = (items: readonly QuoteDraftItem[], laborId: string): QuoteDraftItem[] =>
  orBlank(items.filter((item) => !(item.id === laborId && item.type === 'labor')));

/** Removes a service together with its labor line; removing a loose labor line removes just that line. */
export const removeService = (items: readonly QuoteDraftItem[], id: string): QuoteDraftItem[] =>
  orBlank(items.filter((item) => item.id !== id && !(item.type === 'labor' && item.parentId === id)));

/** Sum of the typed labor prices (invalid or empty text counts as 0). */
export const laborSubtotalOf = (items: readonly QuoteDraftItem[]): number =>
  items.filter(isLaborRow).reduce((sum, item) => sum + amountValue(item.unitPrice) * (Number(item.quantity) || 1), 0);

/** With no labor left, a fixed-amount discount has nothing to apply to: it goes back to 0 (percentages are harmless). */
export function rebaseFixedDiscount(form: QuoteFormData): QuoteFormData {
  return form.laborDiscountType === 'fixed' && laborSubtotalOf(form.items) <= 0 && form.laborDiscountValue !== '0'
    ? { ...form, laborDiscountValue: '0' }
    : form;
}

export const laborRowCount = (items: readonly QuoteDraftItem[]): number => items.filter(isLaborRow).length;

/** Form rows for a saved quotation: parts and labor keep their order, ids and parentId. */
export function formItemsFromQuotation(items: Quotation['items']): QuoteDraftItem[] {
  return items.map((item): QuoteDraftItem => ({
    id: item.id,
    type: item.type,
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: String(item.saleUnitPrice),
    ...(item.type === 'labor' && item.parentId ? { parentId: item.parentId } : {}),
  }));
}

/**
 * Brings a stored draft to the current form shape. An old draft's single labor amount (> 0) becomes a loose
 * "Mano de obra" row at the end, like the labor line of an old quotation; empty or 0 creates nothing.
 */
export function migrateDraftData(data: LegacyQuoteFormData, newId: () => string = createId): QuoteFormData {
  const { laborAmount, ...rest } = data;
  const parsed = typeof laborAmount === 'string' ? parseDecimalStrict(laborAmount) : null;
  const legacy = parsed?.ok && parsed.valor > 0
    ? [{ id: newId(), type: 'labor' as const, description: LABOR_DESCRIPTION, quantity: '1', unitPrice: parsed.texto }]
    : [];
  return { ...rest, customerNotes: rest.customerNotes ?? '', items: [...rest.items, ...legacy] };
}
