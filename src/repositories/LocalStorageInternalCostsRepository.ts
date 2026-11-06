import type { InternalCostRecord, InternalCostsRepository } from '../models/internalCosts';
import { createId, calculateRealUnitCost } from '../utils/quotation';
import { toCents } from '../utils/currencyUtils';
import { readGuardedJson } from '../storage/corruptBackup';
import type { GuardedReadOptions } from '../storage/corruptBackup';
import { readRaw } from '../storage/safeStorage';

export const INTERNAL_COSTS_KEY = 'jc-motors-internal-costs-v1';
const LEGACY_KEY = 'jc-motors:internal-controls:v1';
const DAMAGED: GuardedReadOptions = {
  backupName: 'internal-costs',
  damagedMessage: 'Los costos internos estaban dañados; se guardó una copia de respaldo',
};

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

function isCostRecordList(value: unknown): value is InternalCostRecord[] {
  return Array.isArray(value) && value.every(validRecord) && new Set(value.map(r => r.quoteId)).size === value.length;
}

export class LocalStorageInternalCostsRepository implements InternalCostsRepository {
  private read(): InternalCostRecord[] {
    const result = readGuardedJson(INTERNAL_COSTS_KEY, DAMAGED, isCostRecordList);
    const records: InternalCostRecord[] = result.status === 'ok' ? [...result.value] : [];
    // Migrate costs without touching legacy payment records or customer quotations.
    // The legacy key belongs to the internal-control repository, which quarantines it if damaged; here it is only skipped.
    const legacyRaw = readRaw(LEGACY_KEY);
    let legacy: unknown = [];
    try { legacy = legacyRaw ? JSON.parse(legacyRaw) : []; } catch { legacy = []; }
    if (Array.isArray(legacy)) {
      for (const old of legacy) {
        if (!old || typeof old.quotationId !== 'string' || !Array.isArray(old.partCosts)) continue;
        if (records.some(r => r.quoteId === old.quotationId) || old.partCosts.length === 0) continue;
        try {
          const migrated: InternalCostRecord = {
            id: old.id ?? createId(), quoteId: old.quotationId,
            itemCosts: old.partCosts.map((c: { quotationItemId: string; supplierUnitCost: number; supplierDiscountType: 'fixed' | 'percentage'; supplierDiscountValue: number }) => ({
              quoteItemId: c.quotationItemId,
              actualUnitCostCents: toCents(calculateRealUnitCost(c.supplierUnitCost, c.supplierDiscountType, c.supplierDiscountValue)),
            })), additionalExpenses: [], createdAt: old.createdAt, updatedAt: old.updatedAt,
          };
          if (validRecord(migrated)) records.push(migrated);
        } catch { /* Un registro anterior inválido se omite; el original no se modifica. */ }
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
    globalThis.localStorage?.setItem(INTERNAL_COSTS_KEY, JSON.stringify([...records.filter(r => r.quoteId !== saved.quoteId), saved]));
    return structuredClone(saved);
  }
}
