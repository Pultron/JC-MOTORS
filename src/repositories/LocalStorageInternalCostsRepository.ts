import type { InternalCostRecord, InternalCostsRepository } from '../models/internalCosts';
import { createId, calculateRealUnitCost } from '../utils/quotation';
import { toCents } from '../utils/currencyUtils';

export const INTERNAL_COSTS_KEY = 'jc-motors-internal-costs-v1';
const LEGACY_KEY = 'jc-motors:internal-controls:v1';

function validRecord(value: unknown): value is InternalCostRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as InternalCostRecord;
  const money = (v: number) => Number.isSafeInteger(v) && v >= 0;
  return typeof r.id === 'string' && typeof r.quoteId === 'string'
    && typeof r.createdAt === 'string' && typeof r.updatedAt === 'string'
    && Array.isArray(r.itemCosts) && r.itemCosts.every(c => c && typeof c.quoteItemId === 'string' && (c.actualUnitCostCents === null || money(c.actualUnitCostCents)))
    && new Set(r.itemCosts.map(c => c.quoteItemId)).size === r.itemCosts.length
    && Array.isArray(r.additionalExpenses) && r.additionalExpenses.every(e => e && typeof e.id === 'string' && typeof e.description === 'string' && Boolean(e.description.trim()) && money(e.amountCents))
    && new Set(r.additionalExpenses.map(e => e.id)).size === r.additionalExpenses.length;
}

export class LocalStorageInternalCostsRepository implements InternalCostsRepository {
  private read(): InternalCostRecord[] {
    const raw = localStorage.getItem(INTERNAL_COSTS_KEY);
    const records: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(records) || !records.every(validRecord)
      || new Set(records.map(r => r.quoteId)).size !== records.length) {
      throw new Error('No se pudieron leer los gastos guardados. Los datos originales se conservaron.');
    }
    // Migrate costs without touching legacy payment records or customer quotations.
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy: unknown = JSON.parse(legacyRaw);
      if (!Array.isArray(legacy)) throw new Error('No se pudo leer el control interno anterior.');
      for (const old of legacy) {
        if (!old || typeof old.quotationId !== 'string' || !Array.isArray(old.partCosts)) throw new Error('El control interno anterior tiene datos inválidos.');
        if (records.some(r => r.quoteId === old.quotationId) || old.partCosts.length === 0) continue;
        const migrated: InternalCostRecord = {
          id: old.id ?? createId(), quoteId: old.quotationId,
          itemCosts: old.partCosts.map((c: { quotationItemId: string; supplierUnitCost: number; supplierDiscountType: 'fixed' | 'percentage'; supplierDiscountValue: number }) => ({
            quoteItemId: c.quotationItemId,
            actualUnitCostCents: toCents(calculateRealUnitCost(c.supplierUnitCost, c.supplierDiscountType, c.supplierDiscountValue)),
          })), additionalExpenses: [], createdAt: old.createdAt, updatedAt: old.updatedAt,
        };
        if (!validRecord(migrated)) throw new Error('No se pudieron recuperar los costos anteriores.');
        records.push(migrated);
      }
    }
    return records;
  }

  async list(): Promise<InternalCostRecord[]> { return this.read(); }

  async save(record: InternalCostRecord): Promise<InternalCostRecord> {
    if (!validRecord(record)) throw new Error('Revisa los costos y las descripciones de los gastos.');
    const records = this.read();
    const existing = records.find(r => r.quoteId === record.quoteId);
    const saved = { ...record, id: existing?.id ?? record.id,
      createdAt: existing?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
    localStorage.setItem(INTERNAL_COSTS_KEY, JSON.stringify([...records.filter(r => r.quoteId !== saved.quoteId), saved]));
    return structuredClone(saved);
  }
}
