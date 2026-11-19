import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';

const mem = installMemoryStorage();
const { LocalStorageQuotationRepository } = await import('../src/repositories/LocalStorageQuotationRepository.ts');
const { LocalStorageInternalCostsRepository } = await import('../src/repositories/LocalStorageInternalCostsRepository.ts');
const { LocalStorageInternalControlRepository } = await import('../src/repositories/LocalStorageInternalControlRepository.ts');
const { removeInternalRecordsOf } = await import('../src/services/internalRecordsCleanup.ts');
const { calculateProfit } = await import('../src/services/profitCalculationService.ts');
const { isInRange } = await import('../src/utils/dateRangeUtils.ts');

const input = (price) => ({
  customer: { name: 'Carlos', phone: '5512345678' },
  vehicle: { make: 'Nissan', model: 'Sentra', plates: 'ABC' },
  items: [{ id: 'p1', type: 'part', description: 'Filtro', quantity: 1, saleUnitPrice: price }],
  laborDiscountType: 'fixed', laborDiscountValue: 0, includeVat: false, validityDays: 15, publicNotes: '',
});
const everything = { start: '2000-01-01', end: '2999-12-31' };
beforeEach(() => { mem.data.clear(); });

async function setup() {
  const quotations = new LocalStorageQuotationRepository();
  const costs = new LocalStorageInternalCostsRepository();
  const control = new LocalStorageInternalControlRepository();
  const a = await quotations.approve((await quotations.create(input(100))).id);
  const b = await quotations.approve((await quotations.create(input(250))).id);
  for (const q of [a, b]) {
    await costs.save({ id: `c-${q.id}`, quoteId: q.id, itemCosts: [{ quoteItemId: 'p1', actualUnitCostCents: 4000 }], additionalExpenses: [], createdAt: '', updatedAt: '' });
    await control.ensureForQuotation(q);
  }
  return { quotations, costs, control, a, b };
}

const soldTotal = async (quotations, costs) => {
  const records = await costs.list();
  return (await quotations.list()).filter((q) => isInRange(q, everything))
    .reduce((sum, q) => sum + calculateProfit(q, records.find((r) => r.quoteId === q.id)).soldTotalCents, 0);
};

test('cancelling removes the quote from Control interno by exactly its sold value and keeps its costs', async () => {
  const { quotations, costs, a, b } = await setup();
  const before = await soldTotal(quotations, costs);
  assert.equal(before, 35000);
  await quotations.cancel(b.id, 'El cliente ya no quiso el trabajo');
  assert.equal(before - await soldTotal(quotations, costs), 25000);
  assert.equal((await costs.list()).some((r) => r.quoteId === b.id), true);
  assert.equal((await costs.list()).some((r) => r.quoteId === a.id), true);
});

test('deleting a cancelled quotation removes both internal record kinds and they cannot come back', async () => {
  const { quotations, costs, control, a, b } = await setup();
  // Legacy control record with part costs: reading costs would re-migrate it if it were left behind.
  await control.save({ ...(await control.getByQuotationId(b.id)), partCosts: [{ quotationItemId: 'p1', supplierUnitCost: 40, supplierDiscountType: 'fixed', supplierDiscountValue: 0 }] }, b);
  await quotations.cancel(b.id, 'Se aprobó por error');
  await removeInternalRecordsOf(b.id, { control, costs });
  assert.ok(await quotations.deletePermanently(b.id));
  assert.equal(await control.getByQuotationId(b.id), undefined);
  assert.equal((await costs.list()).some((r) => r.quoteId === b.id), false);
  assert.equal((await new LocalStorageInternalCostsRepository().list()).some((r) => r.quoteId === b.id), false);
  // The other quotation is untouched.
  assert.equal((await costs.list()).filter((r) => r.quoteId === a.id).length, 1);
  assert.ok(await control.getByQuotationId(a.id));
  // The folio counter never goes back.
  const next = await quotations.create(input(10));
  assert.equal(next.folio, 'JC-0003');
});

test('cleanup is idempotent and a failing cleanup rejects so the quotation is not deleted', async () => {
  const { costs, control, a } = await setup();
  await removeInternalRecordsOf(a.id, { control, costs });
  await removeInternalRecordsOf(a.id, { control, costs });
  const failing = { control, costs: { deleteByQuoteId: async () => { throw new Error('disk'); } } };
  await assert.rejects(() => removeInternalRecordsOf('x', failing), /disk/);
});

test('the context deletes internal records only for deletable quotations, before the quotation itself', () => {
  const source = readFileSync(new URL('../src/store/QuotationContext.tsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('const deleteQuotationPermanently'));
  const order = ['isDeletableStatus(target.status)', 'removeInternalRecordsOf(id)', 'quotationService.deletePermanently(id)'].map((s) => body.indexOf(s));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], String(order));
});
