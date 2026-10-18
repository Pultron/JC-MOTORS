import type { InternalCostRecord, InternalCostsRepository, QuotePayment } from '../models/internalCosts';
import type { PaymentMethod } from '../models/quotation';
import { createId, calculateRealUnitCost } from '../utils/quotation';
import { toCents } from '../utils/currencyUtils';

export const INTERNAL_COSTS_KEY = 'jc-motors-internal-costs-v1';
const LEGACY_KEY = 'jc-motors:internal-controls:v1';
const MIGRATION_KEY = 'jc-motors-internal-costs-migrated-v1';
const methods: readonly PaymentMethod[] = ['cash', 'transfer', 'card', 'other'];

function validRecord(value: unknown): value is InternalCostRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as InternalCostRecord;
  const money = (v: number) => Number.isSafeInteger(v) && v >= 0;
  return typeof r.id === 'string' && typeof r.quoteId === 'string'
    && typeof r.createdAt === 'string' && typeof r.updatedAt === 'string'
    && Array.isArray(r.itemCosts) && r.itemCosts.every(c => c && typeof c.quoteItemId === 'string' && (c.actualUnitCostCents === null || money(c.actualUnitCostCents)))
    && new Set(r.itemCosts.map(c => c.quoteItemId)).size === r.itemCosts.length
    && Array.isArray(r.additionalExpenses) && r.additionalExpenses.every(e => e && typeof e.id === 'string' && typeof e.description === 'string' && Boolean(e.description.trim()) && money(e.amountCents))
    && new Set(r.additionalExpenses.map(e => e.id)).size === r.additionalExpenses.length
    && Array.isArray(r.payments) && r.payments.every(p => p && typeof p.id === 'string'
      && Number.isSafeInteger(p.amountCents) && p.amountCents > 0
      && methods.includes(p.method) && /^\d{4}-\d{2}-\d{2}$/.test(p.date)
      && typeof p.reference === 'string')
    && new Set(r.payments.map(p => p.id)).size === r.payments.length
    && (r.internalNotes === undefined || typeof r.internalNotes === 'string');
}

function emptyRecord(quoteId: string): InternalCostRecord {
  const now = new Date().toISOString();
  return { id: createId(), quoteId, itemCosts: [], additionalExpenses: [], payments: [], createdAt: now, updatedAt: now };
}

export class LocalStorageInternalCostsRepository implements InternalCostsRepository {
  private read(): InternalCostRecord[] {
    const raw = localStorage.getItem(INTERNAL_COSTS_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('No se pudieron leer los datos internos guardados.');
    const records = parsed.map((record) => ({ ...record, payments: record?.payments ?? [] })) as InternalCostRecord[];
    if (!records.every(validRecord) || new Set(records.map(r => r.quoteId)).size !== records.length) {
      throw new Error('No se pudieron leer los datos internos guardados. Los originales se conservaron.');
    }

    // Convert the former control record once; keep its original key as a recovery copy.
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw && localStorage.getItem(MIGRATION_KEY) !== 'done') {
      const legacy: unknown = JSON.parse(legacyRaw);
      if (!Array.isArray(legacy)) throw new Error('No se pudo leer el control interno anterior.');
      for (const old of legacy) {
        if (!old || typeof old.quotationId !== 'string' || !Array.isArray(old.partCosts)) {
          throw new Error('El control interno anterior tiene datos inválidos.');
        }
        let record = records.find(r => r.quoteId === old.quotationId);
        if (!record) {
          record = { ...emptyRecord(old.quotationId), id: old.id ?? createId(),
            createdAt: old.createdAt ?? new Date().toISOString(), updatedAt: old.updatedAt ?? new Date().toISOString() };
          records.push(record);
        }
        if (record.itemCosts.length === 0 && old.partCosts.length > 0) {
          record.itemCosts = old.partCosts.map((cost: { quotationItemId: string; supplierUnitCost: number; supplierDiscountType: 'fixed' | 'percentage'; supplierDiscountValue: number }) => ({
            quoteItemId: cost.quotationItemId,
            actualUnitCostCents: toCents(calculateRealUnitCost(cost.supplierUnitCost, cost.supplierDiscountType, cost.supplierDiscountValue)),
          }));
        }
        if (record.payments.length === 0 && Number.isFinite(old.amountReceived) && old.amountReceived > 0) {
          record.payments = [{
            id: `legacy-payment-${old.id ?? old.quotationId}`,
            amountCents: toCents(old.amountReceived),
            method: methods.includes(old.paymentMethod) ? old.paymentMethod : 'other',
            date: /^\d{4}-\d{2}-\d{2}$/.test(old.paymentDate ?? '')
              ? old.paymentDate : String(old.createdAt ?? new Date().toISOString()).slice(0, 10),
            reference: typeof old.paymentReference === 'string' ? old.paymentReference : '',
          }];
        }
        if (!record.internalNotes && typeof old.internalNotes === 'string') record.internalNotes = old.internalNotes;
      }
    }

    if (!records.every(validRecord)) throw new Error('No se pudieron recuperar los datos internos anteriores.');
    if (JSON.stringify(records) !== (raw ?? '[]')) localStorage.setItem(INTERNAL_COSTS_KEY, JSON.stringify(records));
    if (legacyRaw && localStorage.getItem(MIGRATION_KEY) !== 'done') localStorage.setItem(MIGRATION_KEY, 'done');
    return records;
  }

  async list(): Promise<InternalCostRecord[]> { return structuredClone(this.read()); }

  async save(record: InternalCostRecord): Promise<InternalCostRecord> {
    if (!validRecord(record)) throw new Error('Revisa los costos y las descripciones de los gastos.');
    const records = this.read();
    const existing = records.find(r => r.quoteId === record.quoteId);
    const saved = { ...record, id: existing?.id ?? record.id,
      payments: existing?.payments ?? record.payments,
      createdAt: existing?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
    localStorage.setItem(INTERNAL_COSTS_KEY, JSON.stringify([...records.filter(r => r.quoteId !== saved.quoteId), saved]));
    return structuredClone(saved);
  }

  async addPayment(quoteId: string, payment: QuotePayment, totalCents: number): Promise<InternalCostRecord> {
    if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error('El total de la cotización no es válido.');
    const records = this.read();
    const existing = records.find(r => r.quoteId === quoteId);
    const current = existing ?? emptyRecord(quoteId);
    if (!validRecord({ ...current, payments: [payment] })) throw new Error('Revisa los datos del pago.');
    const received = current.payments.reduce((sum, item) => sum + item.amountCents, 0);
    if (received + payment.amountCents > totalCents) throw new Error('El pago supera el saldo pendiente.');
    const saved = { ...current, payments: [...current.payments, payment], updatedAt: new Date().toISOString() };
    localStorage.setItem(INTERNAL_COSTS_KEY, JSON.stringify([...records.filter(r => r.quoteId !== quoteId), saved]));
    return structuredClone(saved);
  }
}
