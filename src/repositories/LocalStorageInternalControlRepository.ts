import type { InternalControlRecord, Quotation } from '../models/quotation';
import { createId } from '../utils/quotation';
import type { InternalControlRepository } from './InternalControlRepository';

const STORAGE_KEY = 'jc-motors:internal-controls:v1';

export class LocalStorageInternalControlRepository implements InternalControlRepository {
  async list(): Promise<InternalControlRecord[]> {
    return this.readAll().map(cloneRecord);
  }

  async getByQuotationId(quotationId: string): Promise<InternalControlRecord | undefined> {
    const record = this.readAll().find((entry) => entry.quotationId === quotationId);
    return record ? cloneRecord(record) : undefined;
  }

  async ensureForQuotation(quotation: Quotation): Promise<InternalControlRecord> {
    const records = this.readAll();
    const existing = records.find((entry) => entry.quotationId === quotation.id);
    if (existing) {
      const refreshed = withDerivedStatus(existing, quotation);
      if (refreshed.internalStatus !== existing.internalStatus) {
        this.writeAll(records.map((entry) => entry.id === existing.id ? refreshed : entry));
      }
      return cloneRecord(refreshed);
    }

    const now = new Date().toISOString();
    const record: InternalControlRecord = {
      id: createId(),
      quotationId: quotation.id,
      partCosts: [],
      internalStatus: quotation.items.some((item) => item.type === 'part') ? 'pending_capture' : 'complete',
      paymentStatus: 'pending',
      paymentMethod: '',
      amountReceived: 0,
      paymentDate: '',
      paymentReference: '',
      internalNotes: '',
      createdAt: now,
      updatedAt: now,
    };
    this.writeAll([...records, record]);
    return cloneRecord(record);
  }

  async save(record: InternalControlRecord, quotation: Quotation): Promise<InternalControlRecord> {
    if (record.quotationId !== quotation.id) throw new Error('El control interno debe pertenecer a la cotización indicada.');
    if (!Number.isFinite(record.amountReceived) || record.amountReceived < 0) {
      throw new Error('La cantidad recibida no puede ser negativa.');
    }
    const partItemIds = new Set(quotation.items.filter((item) => item.type === 'part').map((item) => item.id));
    const capturedItemIds = new Set<string>();
    for (const cost of record.partCosts) {
      if (!partItemIds.has(cost.quotationItemId) || capturedItemIds.has(cost.quotationItemId)) {
        throw new Error('Cada costo interno debe corresponder a una refacción aprobada y ser único.');
      }
      capturedItemIds.add(cost.quotationItemId);
      if (!Number.isFinite(cost.supplierUnitCost) || cost.supplierUnitCost < 0) {
        throw new Error('El costo del proveedor debe ser cero o mayor.');
      }
      if (!Number.isFinite(cost.supplierDiscountValue) || cost.supplierDiscountValue < 0) {
        throw new Error('El descuento del proveedor debe ser cero o mayor.');
      }
      if (cost.supplierDiscountType === 'percentage' && cost.supplierDiscountValue > 100) {
        throw new Error('El porcentaje del proveedor debe estar entre 0 y 100.');
      }
      const maxDiscount = cost.supplierDiscountType === 'percentage'
        ? cost.supplierUnitCost * cost.supplierDiscountValue / 100
        : cost.supplierDiscountValue;
      if (maxDiscount > cost.supplierUnitCost) {
        throw new Error('El descuento no puede dejar el costo real por debajo de cero.');
      }
    }

    const saved = withDerivedStatus({ ...record, updatedAt: new Date().toISOString() }, quotation);
    const records = this.readAll();
    const index = records.findIndex((entry) => entry.quotationId === quotation.id);
    if (index < 0) this.writeAll([...records, saved]);
    else this.writeAll(records.map((entry, entryIndex) => entryIndex === index ? saved : entry));
    return cloneRecord(saved);
  }

  private readAll(): InternalControlRecord[] {
    try {
      const value = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!value) return [];
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as InternalControlRecord[] : [];
    } catch {
      return [];
    }
  }

  private writeAll(records: InternalControlRecord[]): void {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(records));
  }
}

function withDerivedStatus(record: InternalControlRecord, quotation: Quotation): InternalControlRecord {
  const requiredPartIds = quotation.items.filter((item) => item.type === 'part').map((item) => item.id);
  const capturedIds = new Set(record.partCosts.map((cost) => cost.quotationItemId));
  return {
    ...record,
    internalStatus: requiredPartIds.every((id) => capturedIds.has(id)) ? 'complete' : 'pending_capture',
    partCosts: record.partCosts.map((cost) => ({ ...cost })),
  };
}

function cloneRecord(record: InternalControlRecord): InternalControlRecord {
  return { ...record, partCosts: record.partCosts.map((cost) => ({ ...cost })) };
}
