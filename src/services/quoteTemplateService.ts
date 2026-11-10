import type { QuotationItemType } from '../models/quotation';
import type { QuoteDraftItem } from '../models/quoteDraft';
import { readGuardedJson } from '../storage/corruptBackup';
import type { GuardedReadOptions } from '../storage/corruptBackup';
import { isQuotaError, writeRaw } from '../storage/safeStorage';
import { STORAGE_KEYS } from '../storage/storageKeys';
import { createId } from '../utils/quotation';
import { sanitizeSingleLine } from '../validation/fields';
import { MAX_CONCEPTS } from './quotationLayout';

export const MAX_TEMPLATES = 50;
export const TEMPLATE_NAME_MAX_LENGTH = 60;

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

export type TemplateFailure = 'name-empty' | 'name-too-long' | 'name-duplicate' | 'no-items' | 'limit' | 'not-found' | 'storage-full' | 'storage-error';

export type TemplateResult<T = QuoteTemplate> = { ok: true; value: T } | { ok: false; reason: TemplateFailure };

export const TEMPLATE_FAILURE_MESSAGES: Record<TemplateFailure, string> = {
  'name-empty': 'Escribe un nombre para la plantilla.',
  'name-too-long': `El nombre admite máximo ${TEMPLATE_NAME_MAX_LENGTH} caracteres.`,
  'name-duplicate': 'Ya tienes una plantilla con ese nombre.',
  'no-items': 'Agrega al menos un concepto con descripción para guardar la plantilla.',
  limit: `Llegaste al máximo de ${MAX_TEMPLATES} plantillas. Elimina alguna para guardar otra.`,
  'not-found': 'Esa plantilla ya no existe.',
  'storage-full': 'No hay espacio para guardar la plantilla. Libera espacio e inténtalo de nuevo.',
  'storage-error': 'No se pudo guardar la plantilla. Inténtalo de nuevo.',
};

const DAMAGED: GuardedReadOptions = {
  backupName: 'templates',
  damagedMessage: 'Las plantillas estaban dañadas; se guardó una copia de respaldo',
};

const compareKey = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('es-MX');

function toItem(value: unknown): QuoteTemplateItem | null {
  if (!value || typeof value !== 'object') return null;
  const { description, type, quantity, unitPrice } = value as Record<string, unknown>;
  if (typeof description !== 'string' || !description.trim()) return null;
  return {
    description,
    type: type === 'labor' ? 'labor' : 'part',
    quantity: typeof quantity === 'string' && quantity.trim() ? quantity : '1',
    unitPrice: typeof unitPrice === 'string' ? unitPrice : '',
  };
}

function toTemplate(value: unknown): QuoteTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const { id, name, items, createdAt } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim() || !Array.isArray(items)) return null;
  const cleanItems = items.map(toItem).filter((item): item is QuoteTemplateItem => item !== null).slice(0, MAX_CONCEPTS);
  if (cleanItems.length === 0) return null;
  return { id, name, items: cleanItems, createdAt: typeof createdAt === 'string' ? createdAt : '' };
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
    if (templates.length >= MAX_TEMPLATES) return { ok: false, reason: 'limit' };
    const checked = checkTemplateName(name, templates);
    if (!checked.ok) return checked;
    const clean = items.map(toItem).filter((item): item is QuoteTemplateItem => item !== null).slice(0, MAX_CONCEPTS);
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
  remove(id: string): TemplateResult<null> {
    const templates = this.list();
    if (!templates.some((template) => template.id === id)) return { ok: false, reason: 'not-found' };
    const failure = persist(templates.filter((template) => template.id !== id));
    return failure ? { ok: false, reason: failure } : { ok: true, value: null };
  },
};
