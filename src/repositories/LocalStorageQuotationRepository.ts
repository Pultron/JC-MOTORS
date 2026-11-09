import type {
  CreateQuotationInput,
  Customer,
  DiscountType,
  Quotation,
  QuotationItem,
  QuotationStatus,
  Vehicle,
} from '../models/quotation';
import { buildQuotationItems, calculateQuotationTotals, createId, roundCurrency, validateDiscount } from '../utils/quotation';
import type { QuotationRepository } from './QuotationRepository';
import { ensureQuotationFolioAtLeast, nextFolio, reservedDraftFolios } from '../services/folioService';
import { parseGuardedJson, quarantineCorrupt } from '../storage/corruptBackup';
import type { GuardedReadOptions } from '../storage/corruptBackup';
import { readRaw, writeRaw } from '../storage/safeStorage';
import { STORAGE_KEYS } from '../storage/storageKeys';

const STORAGE_KEY = STORAGE_KEYS.quotations;
const DAMAGED: GuardedReadOptions = {
  backupName: 'quotations',
  damagedMessage: 'Las cotizaciones estaban dañadas; se guardó una copia de respaldo',
};
const isList = (value: unknown): value is unknown[] => Array.isArray(value);

/**
 * Sube este número cuando cambie la forma guardada o la lógica de totales: la siguiente lectura normaliza y reescribe
 * UNA vez. Con la versión al día solo se normaliza lo que no tiene la forma actual.
 */
const QUOTATIONS_SCHEMA_VERSION = 1;

function readSchemaVersion(): number {
  try {
    const raw = readRaw(STORAGE_KEYS.schema);
    const version = raw ? (JSON.parse(raw) as { quotations?: unknown }).quotations : 0;
    return typeof version === 'number' && Number.isFinite(version) ? version : 0;
  } catch {
    return 0;
  }
}

function writeSchemaVersion(): void {
  try {
    const raw = readRaw(STORAGE_KEYS.schema);
    const current: unknown = raw ? JSON.parse(raw) : {};
    const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    writeRaw(STORAGE_KEYS.schema, JSON.stringify({ ...base, quotations: QUOTATIONS_SCHEMA_VERSION }));
  } catch { /* Sin la marca, la siguiente lectura normaliza otra vez (es idempotente). */ }
}

const STATUSES: readonly string[] = ['Pendiente', 'Aprobada', 'Cancelada', 'Vencida'];

/** Revisión barata (sin serializar) para detectar datos escritos por otra vía con una forma anterior. */
function looksCurrent(value: unknown): boolean {
  const q = value as Partial<Quotation> | null;
  return Boolean(q) && typeof q === 'object'
    && typeof q!.id === 'string' && typeof q!.folio === 'string' && typeof q!.createdAt === 'string'
    && typeof q!.status === 'string' && STATUSES.includes(q!.status)
    && typeof q!.includeVat === 'boolean' && typeof q!.total === 'number' && typeof q!.validityDays === 'number'
    && Boolean(q!.customer) && Boolean(q!.vehicle) && Array.isArray(q!.items)
    && q!.items.every((item) => item && typeof item.id === 'string' && (item.type === 'part' || item.type === 'labor')
      && typeof item.saleUnitPrice === 'number' && typeof item.quantity === 'number' && typeof item.amount === 'number');
}

type LegacyQuotation = Omit<Partial<Quotation>, 'items' | 'customer' | 'vehicle'> & {
  items?: Array<Partial<QuotationItem> & { unitPrice?: number }>;
  customer?: Customer;
  vehicle?: Vehicle;
  ivaEnabled?: boolean;
};

export class LocalStorageQuotationRepository implements QuotationRepository {
  async list(): Promise<Quotation[]> {
    return this.readAll().map(cloneQuotation);
  }

  async getById(id: string): Promise<Quotation | undefined> {
    const quotation = this.readAll().find((entry) => entry.id === id);
    return quotation ? cloneQuotation(quotation) : undefined;
  }

  async create(input: CreateQuotationInput): Promise<Quotation> {
    const items = buildQuotationItems(input.items);
    const totals = calculateQuotationTotals(items, input.laborDiscountType, input.laborDiscountValue, input.includeVat);
    const discountError = validateDiscount(totals.subtotalManoObra, input.laborDiscountType, input.laborDiscountValue);
    if (discountError) throw new Error(discountError);
    const quotations = this.readAll();
    const usePreferred = Boolean(input.preferredFolio) && !quotations.some((entry) => entry.folio === input.preferredFolio);
    if (usePreferred) ensureQuotationFolioAtLeast(input.preferredFolio!);
    const quotation: Quotation = {
      id: createId(),
      folio: usePreferred ? input.preferredFolio! : this.nextFolio(quotations),
      createdAt: new Date().toISOString(),
      ...(input.customerId ? { customerId: input.customerId } : {}),
      customer: { ...input.customer },
      vehicle: { ...input.vehicle },
      items,
      laborDiscountType: input.laborDiscountType,
      laborDiscountValue: input.laborDiscountValue,
      includeVat: input.includeVat,
      subtotalNeto: totals.subtotalNeto,
      ivaAmount: totals.ivaAmount,
      total: totals.total,
      validityDays: input.validityDays,
      publicNotes: input.publicNotes,
      customerNotes: input.customerNotes ?? '',
      status: 'Pendiente',
    };

    this.writeAll([quotation, ...quotations]);
    return cloneQuotation(quotation);
  }

  async update(id: string, input: CreateQuotationInput): Promise<Quotation | undefined> {
    const quotations = this.readAll();
    const original = quotations.find((entry) => entry.id === id);
    if (!original || original.status !== 'Pendiente') return undefined;

    const items = buildQuotationItems(input.items);
    const totals = calculateQuotationTotals(items, input.laborDiscountType, input.laborDiscountValue, input.includeVat);
    const discountError = validateDiscount(totals.subtotalManoObra, input.laborDiscountType, input.laborDiscountValue);
    if (discountError) throw new Error(discountError);
    const updated: Quotation = {
      ...original,
      createdAt: new Date().toISOString(),
      ...(input.customerId ? { customerId: input.customerId } : { customerId: undefined }),
      customer: { ...input.customer },
      vehicle: { ...input.vehicle },
      items,
      laborDiscountType: input.laborDiscountType,
      laborDiscountValue: input.laborDiscountValue,
      includeVat: input.includeVat,
      subtotalNeto: totals.subtotalNeto,
      ivaAmount: totals.ivaAmount,
      total: totals.total,
      validityDays: input.validityDays,
      publicNotes: input.publicNotes,
      customerNotes: input.customerNotes ?? '',
      status: 'Pendiente',
      approvedAt: undefined,
    };
    this.writeAll(quotations.map((entry) => entry.id === id ? updated : entry));
    return cloneQuotation(updated);
  }

  async duplicate(id: string): Promise<Quotation | undefined> {
    const original = this.readAll().find((entry) => entry.id === id);
    if (!original) return undefined;

    return this.create({
      ...(original.customerId ? { customerId: original.customerId } : {}),
      customer: original.customer,
      vehicle: original.vehicle,
      items: original.items.map(({ id: _id, amount: _amount, ...item }) => ({ ...item, id: createId() })),
      laborDiscountType: original.laborDiscountType,
      laborDiscountValue: original.laborDiscountValue,
      includeVat: original.includeVat,
      validityDays: original.validityDays,
      publicNotes: original.publicNotes,
      customerNotes: original.customerNotes,
    });
  }

  async approve(id: string): Promise<Quotation | undefined> {
    const quotations = this.readAll();
    const quotation = quotations.find((entry) => entry.id === id);
    if (!quotation) return undefined;
    if (quotation.status === 'Aprobada') return cloneQuotation(quotation);
    if (quotation.status !== 'Pendiente') return undefined;

    const approved: Quotation = { ...quotation, status: 'Aprobada', approvedAt: new Date().toISOString() };
    this.writeAll(quotations.map((entry) => entry.id === id ? approved : entry));
    return cloneQuotation(approved);
  }

  async cancel(id: string): Promise<Quotation | undefined> {
    const quotations = this.readAll();
    const quotation = quotations.find((entry) => entry.id === id);
    if (!quotation || quotation.status !== 'Pendiente') return undefined;

    const cancelled: Quotation = { ...quotation, status: 'Cancelada' };
    this.writeAll(quotations.map((entry) => entry.id === id ? cancelled : entry));
    return cloneQuotation(cancelled);
  }

  async deleteCancelled(id: string): Promise<Quotation | undefined> {
    const quotations = this.readAll();
    const quotation = quotations.find((entry) => entry.id === id);
    if (!quotation || quotation.status !== 'Cancelada') return undefined;

    this.writeAll(quotations.filter((entry) => entry.id !== id));
    return cloneQuotation(quotation);
  }

  /** Lista parseada y normalizada; se reutiliza mientras el texto guardado no cambie (también si lo escribe otra ventana). */
  private cache: { raw: string; list: Quotation[] } | null = null;

  private readAll(): Quotation[] {
    const raw = readRaw(STORAGE_KEY);
    if (raw === null) {
      this.cache = null;
      return [];
    }
    const base = this.cache?.raw === raw ? this.cache.list : this.load(raw);
    return this.withExpiry(base);
  }

  private load(raw: string): Quotation[] {
    const result = parseGuardedJson(STORAGE_KEY, raw, DAMAGED, isList);
    if (result.status !== 'ok') {
      this.cache = { raw, list: [] };
      return [];
    }

    const needsNormalization = readSchemaVersion() < QUOTATIONS_SCHEMA_VERSION || !result.value.every(looksCurrent);
    let list: Quotation[];
    try {
      list = needsNormalization
        ? (result.value as LegacyQuotation[]).map((entry, index) => normalizeQuotation(entry, index))
        : result.value as Quotation[];
    } catch {
      quarantineCorrupt(STORAGE_KEY, raw, DAMAGED);
      this.cache = { raw, list: [] };
      return [];
    }

    this.cache = { raw, list };
    if (needsNormalization) {
      try {
        this.writeAll(list);
      } catch { /* Sin espacio para persistir la normalización: se usa solo en memoria. */ }
    }
    return list;
  }

  /** Pendiente → Vencida depende de la hora, no del esquema: se deriva en cada lectura sin volver a parsear. */
  private withExpiry(list: Quotation[]): Quotation[] {
    const now = Date.now();
    let changed = false;
    const result = list.map((quotation) => {
      if (quotation.status !== 'Pendiente' || !isExpired(quotation, now)) return quotation;
      changed = true;
      return { ...quotation, status: 'Vencida' as const };
    });
    if (!changed) return list;
    try {
      this.writeAll(result);
    } catch { /* Sin espacio: el estado vencido se sigue derivando al leer. */ }
    return result;
  }

  private writeAll(quotations: Quotation[]): void {
    const json = JSON.stringify(quotations);
    writeRaw(STORAGE_KEY, json);
    this.cache = { raw: json, list: quotations };
    if (readSchemaVersion() < QUOTATIONS_SCHEMA_VERSION) writeSchemaVersion();
  }

  private nextFolio(quotations: Quotation[]): string {
    return nextFolio([...quotations.map((quotation) => quotation.folio), ...reservedDraftFolios()]);
  }
}

function normalizeQuotation(value: LegacyQuotation, index: number): Quotation {
  const items = (Array.isArray(value.items) ? value.items : []).map((item, itemIndex) => {
    const saleUnitPrice = finiteNumber(item.saleUnitPrice ?? item.unitPrice);
    const quantity = finiteNumber(item.quantity, 1);
    const description = typeof item.description === 'string' ? item.description : 'Concepto';
    const inferredType = /mano de obra|servicio|diagn[oó]stico|instalaci[oó]n/i.test(description) ? 'labor' : 'part';
    return {
      id: typeof item.id === 'string' ? item.id : `migrated-item-${index}-${itemIndex}`,
      type: item.type === 'labor' || item.type === 'part' ? item.type : inferredType,
      description,
      quantity,
      saleUnitPrice,
      amount: roundCurrency(quantity * saleUnitPrice),
    } satisfies QuotationItem;
  });
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString();
  const status = normalizeStatus(value.status);
  const discountType: DiscountType = value.laborDiscountType === 'percentage' ? 'percentage' : 'fixed';
  const discountValue = Math.max(0, finiteNumber(value.laborDiscountValue));
  const includeVat = typeof value.includeVat === 'boolean' ? value.includeVat : value.ivaEnabled ?? true;
  const totals = calculateQuotationTotals(items, discountType, discountValue, includeVat);

  return {
    id: typeof value.id === 'string' ? value.id : `migrated-quotation-${index}`,
    folio: typeof value.folio === 'string' ? value.folio : `JC-${String(index + 1).padStart(4, '0')}`,
    createdAt,
    ...(typeof value.customerId === 'string' ? { customerId: value.customerId } : {}),
    customer: value.customer ?? { name: 'Cliente', phone: '' },
    vehicle: value.vehicle ?? { make: '', model: '', plates: '' },
    items,
    laborDiscountType: discountType,
    laborDiscountValue: discountValue,
    includeVat,
    subtotalNeto: totals.subtotalNeto,
    ivaAmount: totals.ivaAmount,
    total: totals.total,
    validityDays: Math.max(1, Math.floor(finiteNumber(value.validityDays, 15))),
    publicNotes: typeof value.publicNotes === 'string' ? value.publicNotes : '',
    customerNotes: typeof value.customerNotes === 'string' ? value.customerNotes : '',
    status,
    ...(status === 'Aprobada' ? { approvedAt: value.approvedAt ?? createdAt } : {}),
  };
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isExpired(quotation: Quotation, now: number): boolean {
  const createdAt = Date.parse(quotation.createdAt);
  return Number.isFinite(createdAt) && now >= createdAt + quotation.validityDays * 24 * 60 * 60 * 1000;
}

/** 'Rechazada' era el nombre anterior de 'Cancelada': se migra para no perder el estado guardado. */
function normalizeStatus(value: unknown): QuotationStatus {
  if (value === 'Aprobada') return 'Aprobada';
  if (value === 'Cancelada' || value === 'Rechazada') return 'Cancelada';
  if (value === 'Vencida') return 'Vencida';
  return 'Pendiente';
}

function cloneQuotation(quotation: Quotation): Quotation {
  return {
    ...quotation,
    customer: { ...quotation.customer },
    vehicle: { ...quotation.vehicle },
    items: quotation.items.map((item) => ({ ...item })),
  };
}
