import type { QuotationItemType } from '../models/quotation';
import type { QuoteDraftItem } from '../models/quoteDraft';
import { readGuardedJson } from '../storage/corruptBackup';
import type { GuardedReadOptions } from '../storage/corruptBackup';
import { isQuotaError, writeRaw } from '../storage/safeStorage';
import { STORAGE_KEYS } from '../storage/storageKeys';
import { createId } from '../utils/quotation';
import { sanitizeMoneyInput, sanitizeSingleLine } from '../validation/fields';
import { MAX_CONCEPTS } from './quotationLayout';

export const TEMPLATE_NAME_MAX_LENGTH = 60;
/** Fired on `window` after the saved concepts change, so the description suggestions can refresh. */
export const TEMPLATES_CHANGED_EVENT = 'jc:templates-changed';

/** A concept inside a template. `unitPrice` is only a suggestion: the user can edit it after applying. */
export interface QuoteTemplateItem {
  description: string;
  type: QuotationItemType;
  quantity: string;
  unitPrice: string;
}

export interface QuoteTemplate {
  id: string;
  name: string;
  items: QuoteTemplateItem[];
  createdAt: string;
}

export type TemplateFailure = 'name-empty' | 'name-too-long' | 'name-duplicate' | 'no-items' | 'not-found' | 'storage-full' | 'storage-error';

export type TemplateResult<T = QuoteTemplate> = { ok: true; value: T } | { ok: false; reason: TemplateFailure };

export const TEMPLATE_FAILURE_MESSAGES: Record<TemplateFailure, string> = {
  'name-empty': 'Escribe un nombre para el concepto.',
  'name-too-long': `El nombre admite máximo ${TEMPLATE_NAME_MAX_LENGTH} caracteres.`,
  'name-duplicate': 'Ya tienes un concepto con ese nombre.',
  'no-items': 'Agrega al menos un concepto con descripción para guardar el concepto.',
  'not-found': 'Ese concepto ya no existe.',
  'storage-full': 'No hay espacio para guardar el concepto. Libera espacio e inténtalo de nuevo.',
  'storage-error': 'No se pudo guardar el concepto. Inténtalo de nuevo.',
};

const DAMAGED: GuardedReadOptions = {
  backupName: 'templates',
  damagedMessage: 'Los conceptos guardados estaban dañados; se guardó una copia de respaldo',
};

const compareKey = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('es-MX');

function toItem(value: unknown): QuoteTemplateItem | null {
  if (!value || typeof value !== 'object') return null;
  const { description, type, quantity, unitPrice } = value as Record<string, unknown>;
  if (typeof description !== 'string') return null;
  const cleanDescription = sanitizeSingleLine(description);
  if (!cleanDescription) return null;
  return {
    description: cleanDescription,
    type: type === 'labor' ? 'labor' : 'part',
    quantity: typeof quantity === 'string' && quantity.trim() ? quantity.trim() : '1',
    unitPrice: typeof unitPrice === 'string' ? sanitizeMoneyInput(unitPrice).trim() : '',
  };
}

const cleanItems = (items: readonly QuoteTemplateItem[]) => items.map(toItem).filter((item): item is QuoteTemplateItem => item !== null).slice(0, MAX_CONCEPTS);

function toTemplate(value: unknown): QuoteTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const { id, name, items, createdAt } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim() || !Array.isArray(items)) return null;
  const clean = cleanItems(items);
  if (clean.length === 0) return null;
  return { id, name, items: clean, createdAt: typeof createdAt === 'string' ? createdAt : '' };
}

/** Validates a template name. Returns the clean name, or why it cannot be used. `ignoreId` lets a rename keep its own name. */
export function checkTemplateName(name: string, existing: readonly QuoteTemplate[], ignoreId?: string): TemplateResult<string> {
  const clean = sanitizeSingleLine(name);
  if (!clean) return { ok: false, reason: 'name-empty' };
  if (clean.length > TEMPLATE_NAME_MAX_LENGTH) return { ok: false, reason: 'name-too-long' };
  const key = compareKey(clean);
  if (existing.some((template) => template.id !== ignoreId && compareKey(template.name) === key)) return { ok: false, reason: 'name-duplicate' };
  return { ok: true, value: clean };
}

/** Name for a template built in the editor: the first concept's description, plus how many more it holds. */
export function deriveTemplateName(items: readonly Pick<QuoteTemplateItem, 'description'>[]): string {
  const filled = items.map((item) => sanitizeSingleLine(item.description)).filter(Boolean);
  if (filled.length === 0) return '';
  const suffix = filled.length > 1 ? ` + ${filled.length - 1} más` : '';
  return `${filled[0].slice(0, TEMPLATE_NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`;
}

/** The concepts worth saving from the form: rows with a description. Quantity and price are kept as typed. */
export function templateItemsFromForm(items: readonly Pick<QuoteDraftItem, 'description' | 'type' | 'quantity' | 'unitPrice'>[]): QuoteTemplateItem[] {
  return items
    .map((item) => toItem({ description: sanitizeSingleLine(item.description), type: item.type, quantity: item.quantity, unitPrice: item.unitPrice }))
    .filter((item): item is QuoteTemplateItem => item !== null);
}

export interface AppendResult {
  items: QuoteDraftItem[];
  added: number;
  /** Concepts of the template that did not fit under the cap. */
  skipped: number;
}

const isBlankRow = (item: QuoteDraftItem) => !item.description.trim() && !item.unitPrice.trim();

/**
 * Appends the template's concepts to the existing ones (editable copies with fresh ids), never going over `cap`.
 * A lone untouched blank row is the form's placeholder, so it makes room instead of staying as an empty concept.
 */
export function appendTemplateItems(existing: readonly QuoteDraftItem[], template: Pick<QuoteTemplate, 'items'>, cap = MAX_CONCEPTS, newId: () => string = createId): AppendResult {
  const base = existing.length === 1 && isBlankRow(existing[0]) ? [] : [...existing];
  const room = Math.max(0, cap - base.length);
  const taken = template.items.slice(0, room);
  const items = [...base, ...taken.map((item): QuoteDraftItem => ({ id: newId(), type: item.type, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice }))];
  return { items: items.length > 0 ? items : [...existing], added: taken.length, skipped: template.items.length - taken.length };
}

function persist(templates: QuoteTemplate[]): TemplateFailure | null {
  try {
    writeRaw(STORAGE_KEYS.templates, JSON.stringify(templates));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(TEMPLATES_CHANGED_EVENT));
    return null;
  } catch (error) {
    return isQuotaError(error) ? 'storage-full' : 'storage-error';
  }
}

export const quoteTemplateService = {
  /** Never throws. A damaged value is copied to a backup key (with a notice) and read as an empty list. */
  list(): QuoteTemplate[] {
    const result = readGuardedJson(STORAGE_KEYS.templates, DAMAGED, (value): value is unknown[] => Array.isArray(value));
    if (result.status !== 'ok') return [];
    return result.value.map(toTemplate).filter((template): template is QuoteTemplate => template !== null);
  },
  create(name: string, items: readonly QuoteTemplateItem[], now = new Date()): TemplateResult {
    const templates = this.list();
    const checked = checkTemplateName(name, templates);
    if (!checked.ok) return checked;
    const clean = cleanItems(items);
    if (clean.length === 0) return { ok: false, reason: 'no-items' };
    const template: QuoteTemplate = { id: createId(), name: checked.value, items: clean, createdAt: now.toISOString() };
    const failure = persist([...templates, template]);
    return failure ? { ok: false, reason: failure } : { ok: true, value: template };
  },
  rename(id: string, name: string): TemplateResult {
    const templates = this.list();
    const target = templates.find((template) => template.id === id);
    if (!target) return { ok: false, reason: 'not-found' };
    const checked = checkTemplateName(name, templates, id);
    if (!checked.ok) return checked;
    const renamed = { ...target, name: checked.value };
    const failure = persist(templates.map((template) => (template.id === id ? renamed : template)));
    return failure ? { ok: false, reason: failure } : { ok: true, value: renamed };
  },
  /** Replaces a template's name and concepts (same validation as `create`); keeps its id and creation date. */
  update(id: string, name: string, items: readonly QuoteTemplateItem[]): TemplateResult {
    const templates = this.list();
    const target = templates.find((template) => template.id === id);
    if (!target) return { ok: false, reason: 'not-found' };
    const checked = checkTemplateName(name, templates, id);
    if (!checked.ok) return checked;
    const clean = cleanItems(items);
    if (clean.length === 0) return { ok: false, reason: 'no-items' };
    const updated: QuoteTemplate = { ...target, name: checked.value, items: clean };
    const failure = persist(templates.map((template) => (template.id === id ? updated : template)));
    return failure ? { ok: false, reason: failure } : { ok: true, value: updated };
  },
  remove(id: string): TemplateResult<null> {
    const templates = this.list();
    if (!templates.some((template) => template.id === id)) return { ok: false, reason: 'not-found' };
    const failure = persist(templates.filter((template) => template.id !== id));
    return failure ? { ok: false, reason: failure } : { ok: true, value: null };
  },
};
