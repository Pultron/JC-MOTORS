import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { LocalStorageQuotationRepository } from '../src/repositories/LocalStorageQuotationRepository.ts';
import { LocalStorageInternalCostsRepository } from '../src/repositories/LocalStorageInternalCostsRepository.ts';
import { buildMonthlyReport } from '../src/services/monthlyReportService.ts';
import { matchesQuotationSearch } from '../src/utils/quotationSearch.ts';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};
beforeEach(() => storage.clear());

const input = () => ({
  customer: { name: 'María López', phone: '6671234567' },
  vehicle: { make: 'Nissan', model: 'Sentra', year: 2022, plates: 'ABC-123' },
  items: [{ id: 'part-1', type: 'part', description: 'Balatas', quantity: 1, saleUnitPrice: 100 }],
  laborDiscountType: 'fixed', laborDiscountValue: 0, includeVat: false,
  validityDays: 15, publicNotes: '', customerNotes: '',
});

test('editar una pendiente conserva folio e ID y queda bloqueado al aprobar', async () => {
  const repo = new LocalStorageQuotationRepository();
  const original = await repo.create(input());
  const count = (await repo.list()).length;
  const edited = await repo.update(original.id, { ...input(), customer: { ...input().customer, name: 'Cliente corregido' },
    items: [{ ...input().items[0], saleUnitPrice: 125 }] });
  assert.equal(edited.folio, original.folio);
  assert.equal(edited.id, original.id);
  assert.equal(edited.createdAt, original.createdAt);
  assert.equal(edited.total, 125);
  assert.equal((await repo.list()).length, count);
  assert.equal((await repo.approve(original.id)).status, 'Aprobada');
  assert.equal(await repo.update(original.id, input()), undefined);
  assert.equal(await repo.setProgress(original.id, 'Terminada'), undefined);
  assert.equal((await repo.setProgress(original.id, 'En proceso')).status, 'En proceso');
  assert.equal((await repo.setProgress(original.id, 'Terminada')).status, 'Terminada');
  assert.equal((await repo.setProgress(original.id, 'Entregada')).status, 'Entregada');
  assert.equal(await repo.setProgress(original.id, 'En proceso'), undefined);
});

test('una pendiente vencida deja de poder aprobarse o editarse', async () => {
  const old = { ...input(), id: 'expired', folio: 'JC-9000', createdAt: '2020-01-01T00:00:00.000Z',
    status: 'Pendiente', items: [{ ...input().items[0], amount: 100 }] };
  storage.set('jc-motors:quotations:v1', JSON.stringify([old]));
  const repo = new LocalStorageQuotationRepository();
  assert.equal((await repo.getById('expired')).status, 'Vencida');
  assert.equal(await repo.approve('expired'), undefined);
  assert.equal(await repo.update('expired', input()), undefined);
});

test('pagos parciales respetan el saldo y sobreviven a guardar gastos', async () => {
  const repo = new LocalStorageInternalCostsRepository();
  const payment = { id: 'pay-1', amountCents: 4000, method: 'cash', date: '2026-10-18', reference: 'Anticipo' };
  const paid = await repo.addPayment('quote-1', payment, 10000);
  assert.equal(paid.payments[0].amountCents, 4000);
  await assert.rejects(repo.addPayment('quote-1', { ...payment, id: 'pay-2', amountCents: 7000 }, 10000), /saldo/);
  await repo.save({ ...paid, itemCosts: [{ quoteItemId: 'part-1', actualUnitCostCents: 1000 }] });
  assert.equal((await repo.list())[0].payments[0].amountCents, 4000);
});

test('búsqueda por vehículo y reporte mensual separan aprobadas de perdidas', () => {
  const base = { ...input(), id: 'approved', folio: 'JC-9001', createdAt: '2026-10-01T12:00:00',
    approvedAt: '2026-10-10T12:00:00', status: 'En proceso', items: [{ ...input().items[0], amount: 100 }] };
  const lost = { ...base, id: 'lost', folio: 'JC-9002', status: 'Cancelada', approvedAt: undefined,
    cancelledAt: '2026-10-12T12:00:00' };
  assert.equal(matchesQuotationSearch(base, 'abc-123'), true);
  assert.equal(matchesQuotationSearch(base, 'nissan sentra'), true);
  const report = buildMonthlyReport('2026-10', [base, lost], []);
  assert.equal(report.approvedCount, 1);
  assert.equal(report.lostCount, 1);
  assert.equal(report.salesCents, 10000);
  assert.equal(report.rows.find((row) => row.quotation.id === 'approved').provisional, true);
});
