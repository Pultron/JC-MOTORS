import type {
  CreateQuotationInput,
  Customer,
  DiscountType,
  Quotation,
  QuotationItem,
  QuotationStatus,
  Vehicle,
} from '../models/quotation';
import { calculateQuotationTotals, createId, roundCurrency, validateDiscount } from '../utils/quotation';
import type { QuotationRepository } from './QuotationRepository';
import { quotationFixtures } from './quotationFixtures';
import { nextFolio, reservedDraftFolios } from '../services/folioService';
import { expirationDate, nextProgressStatus } from '../utils/quotationStatus';

const STORAGE_KEY = 'jc-motors:quotations:v1';

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
    const items = input.items.map((item) => ({
      ...item,
      amount: roundCurrency(item.quantity * item.saleUnitPrice),
    }));
    const totals = calculateQuotationTotals(items, input.laborDiscountType, input.laborDiscountValue, input.includeVat);
    const discountError = validateDiscount(totals.subtotalManoObra, input.laborDiscountType, input.laborDiscountValue);
    if (discountError) throw new Error(discountError);
    const quotations = this.readAll();
    const quotation: Quotation = {
      id: createId(),
      folio: input.preferredFolio && !quotations.some((entry) => entry.folio === input.preferredFolio)
        ? input.preferredFolio : this.nextFolio(quotations),
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

  async update(id: string, input: CreateQuotationInput): Promise<Quotation | undefined> {
    const quotations = this.readAll();
    const existing = quotations.find((entry) => entry.id === id);
    if (!existing || existing.status !== 'Pendiente') return undefined;
    const items = input.items.map((item) => ({ ...item, amount: roundCurrency(item.quantity * item.saleUnitPrice) }));
    const totals = calculateQuotationTotals(items, input.laborDiscountType, input.laborDiscountValue, input.includeVat);
    const discountError = validateDiscount(totals.subtotalManoObra, input.laborDiscountType, input.laborDiscountValue);
    if (discountError) throw new Error(discountError);
    const updated: Quotation = {
      ...existing,
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
    };
    this.writeAll(quotations.map((entry) => entry.id === id ? updated : entry));
    return cloneQuotation(updated);
  }

  async approve(id: string): Promise<Quotation | undefined> {
    const quotations = this.readAll();
    const quotation = quotations.find((entry) => entry.id === id);
    if (!quotation || quotation.status !== 'Pendiente') return undefined;

    const approvedAt = new Date().toISOString();
    const approved: Quotation = { ...quotation, status: 'Aprobada', approvedAt, statusUpdatedAt: approvedAt };
    this.writeAll(quotations.map((entry) => entry.id === id ? approved : entry));
    return cloneQuotation(approved);
  }

  async cancel(id: string): Promise<Quotation | undefined> {
    const quotations = this.readAll();
    const quotation = quotations.find((entry) => entry.id === id);
    if (!quotation || quotation.status !== 'Pendiente') return undefined;

    const cancelledAt = new Date().toISOString();
    const cancelled: Quotation = { ...quotation, status: 'Cancelada', cancelledAt, statusUpdatedAt: cancelledAt };
    this.writeAll(quotations.map((entry) => entry.id === id ? cancelled : entry));
    return cloneQuotation(cancelled);
  }

  async setProgress(id: string, status: QuotationStatus): Promise<Quotation | undefined> {
    const quotations = this.readAll();
    const existing = quotations.find((entry) => entry.id === id);
    if (!existing || nextProgressStatus(existing.status) !== status) return undefined;
    const updated: Quotation = { ...existing, status, statusUpdatedAt: new Date().toISOString() };
    this.writeAll(quotations.map((entry) => entry.id === id ? updated : entry));
    return cloneQuotation(updated);
  }

  private readAll(): Quotation[] {
    let saved: string | null = null;
    try {
      saved = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return quotationFixtures.map(cloneQuotation);
    }

    if (saved === null) {
      const initial = quotationFixtures.map(cloneQuotation);
      this.writeAll(initial);
      return initial;
    }

    try {
      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error('Invalid quotation data');
      const normalized = (parsed as LegacyQuotation[]).map((entry, index) => normalizeQuotation(entry, index));
      if (JSON.stringify(normalized) !== JSON.stringify(parsed)) this.writeAll(normalized);
      return normalized;
    } catch {
      const initial = quotationFixtures.map(cloneQuotation);
      this.writeAll(initial);
      return initial;
    }
  }

  private writeAll(quotations: Quotation[]): void {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(quotations));
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
  const status = normalizeStatus(value.status, createdAt, value.validityDays);
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
    ...(status === 'Vencida' ? { statusUpdatedAt: expirationDate({ createdAt, validityDays: Math.max(1, Math.floor(finiteNumber(value.validityDays, 15))) }).toISOString() } : {}),
    ...(status === 'Cancelada' ? { cancelledAt: value.cancelledAt ?? createdAt } : {}),
    ...(status === 'Aprobada' || status === 'En proceso' || status === 'Terminada' || status === 'Entregada'
      ? { approvedAt: value.approvedAt ?? createdAt } : {}),
    ...(status !== 'Vencida' && typeof value.statusUpdatedAt === 'string' ? { statusUpdatedAt: value.statusUpdatedAt } : {}),
  };
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 'Rechazada' era el nombre anterior de 'Cancelada': se migra para no perder el estado guardado. */
function normalizeStatus(value: unknown, createdAt: string, validityDays: unknown): QuotationStatus {
  if (value === 'Aprobada' || value === 'En proceso' || value === 'Terminada' || value === 'Entregada') return value;
  if (value === 'Cancelada' || value === 'Rechazada') return 'Cancelada';
  if (value === 'Vencida') return 'Vencida';
  const validDays = Math.max(1, Math.floor(finiteNumber(validityDays, 15)));
  if (expirationDate({ createdAt, validityDays: validDays }).getTime() <= Date.now()) return 'Vencida';
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
