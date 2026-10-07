import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { calculateProfit } from '../src/services/profitCalculationService.ts';
import { LocalStorageInternalCostsRepository, INTERNAL_COSTS_KEY } from '../src/repositories/LocalStorageInternalCostsRepository.ts';
import { parseCents } from '../src/utils/currencyUtils.ts';
import { periodRange, isInRange } from '../src/utils/dateRangeUtils.ts';
import { toPublicQuotation } from '../src/utils/quotation.ts';

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
beforeEach(() => storage.clear());
const quote = () => ({ id: 'q1', folio: 'JC-0042', createdAt: '2026-10-05T12:00:00', approvedAt: '2026-10-05T12:00:00', status: 'Aprobada',
  customer: { name: 'Carlos Méndez', phone: '6671234567' }, vehicle: { make: 'Nissan', model: 'Sentra', year: 2022, plates: 'ABC123' },
  items: [{ id: 'p1', type: 'part', description: 'Balatas', quantity: 2, saleUnitPrice: 1200.50, amount: 2401 }, { id: 'p2', type: 'part', description: 'Filtro', quantity: 1, saleUnitPrice: 300, amount: 300 }, { id: 'l1', type: 'labor', description: 'Instalación', quantity: 1, saleUnitPrice: 1000, amount: 1000 }],
  laborDiscountType: 'percentage', laborDiscountValue: 10, includeVat: true, publicNotes: '', validityDays: 15 });
const record = () => ({ id: 'r1', quoteId: 'q1', itemCosts: [{ quoteItemId: 'p1', actualUnitCostCents: 78025 }, { quoteItemId: 'p2', actualUnitCostCents: 18000 }], additionalExpenses: [{ id: 'e1', description: 'Envío', amountCents: 12000 }], createdAt: '', updatedAt: '' });

test('centavos exactos, cantidad por unidad, descuento público y exclusión de IVA', () => {
  assert.equal(parseCents('1200.50'), 120050);
  assert.equal(parseCents('0'), 0);
  assert.equal(parseCents(''), null);
  for (const invalid of ['-1', '1.999', 'NaN', 'Infinity', '1e3']) assert.throws(() => parseCents(invalid));
  const totals = calculateProfit(quote(), record());
  assert.equal(totals.soldTotalCents, 360100);
  assert.equal(totals.spentTotalCents, 186050);
  assert.equal(totals.profitCents, 174050);
  assert.equal(totals.items[0].actualTotalCostCents, 156050);
  assert.equal(totals.items[0].profitCents, 84050);
  assert.equal(totals.soldTotalCents, calculateProfit({ ...quote(), includeVat: false }, record()).soldTotalCents);
});
test('distingue pendiente, captura parcial y cero capturado; conserva pérdidas y margen negativo', () => {
  assert.equal(calculateProfit(quote()).status, 'pending');
  assert.equal(calculateProfit(quote(), { ...record(), itemCosts: [{ quoteItemId: 'p1', actualUnitCostCents: 0 }], additionalExpenses: [] }).status, 'incomplete');
  assert.equal(calculateProfit(quote(), record()).status, 'complete');
  const loss = calculateProfit(quote(), { ...record(), additionalExpenses: [{ id: 'x', description: 'Grúa', amountCents: 500000 }] });
  assert.ok(loss.profitCents < 0 && loss.marginPercentage < 0);
  const zero = calculateProfit({ ...quote(), items: [] }, record());
  assert.equal(zero.marginPercentage, 0);
});
test('Hoy, Semana, Mes y rango inclusivo usan aprobación; excluyen canceladas', () => {
  const now = new Date(2026, 9, 5, 15);
  assert.deepEqual(periodRange('today', now), { start: '2026-10-05', end: '2026-10-05' });
  assert.deepEqual(periodRange('week', now), { start: '2026-10-05', end: '2026-10-11' });
  assert.deepEqual(periodRange('month', now), { start: '2026-10-01', end: '2026-10-31' });
  assert.equal(isInRange(quote(), periodRange('today', now)), true);
  assert.equal(isInRange({ ...quote(), status: 'Cancelada' }, periodRange('month', now)), false);
  assert.equal(isInRange(quote(), { start: '2026-10-06', end: '2026-10-31' }), false);
  assert.equal(isInRange({ ...quote(), createdAt: '2026-09-01T12:00:00' }, periodRange('today', now)), true);
});
test('guardar y reiniciar conserva un registro por quoteId, fechas y cotización pública intacta', async () => {
  const original = quote();
  const before = JSON.stringify(original);
  const publicBefore = JSON.stringify(toPublicQuotation(original));
  const repo = new LocalStorageInternalCostsRepository();
  const saved = await repo.save(record());
  assert.ok(saved.createdAt && saved.updatedAt);
  const updated = await repo.save({ ...saved, id: 'attempted-duplicate', additionalExpenses: [] });
  const reloaded = await new LocalStorageInternalCostsRepository().list();
  assert.equal(reloaded.length, 1);
  assert.equal(updated.id, saved.id);
  assert.equal(updated.createdAt, saved.createdAt);
  assert.equal(reloaded[0].itemCosts[0].actualUnitCostCents, 78025);
  assert.equal(JSON.stringify(original), before);
  assert.equal(JSON.stringify(toPublicQuotation(original)), publicBefore);
  assert.ok(!publicBefore.includes('actualUnitCostCents') && !publicBefore.includes('profitCents'));
});
test('recupera costos anteriores y descuentos sin borrar pagos', async () => {
  const legacy = JSON.stringify([{ id: 'old', quotationId: 'q1', createdAt: '2025-01-01', updatedAt: '2025-01-01', amountReceived: 500, partCosts: [{ quotationItemId: 'p1', supplierUnitCost: 1000, supplierDiscountType: 'percentage', supplierDiscountValue: 20 }] }]);
  storage.set('jc-motors:internal-controls:v1', legacy);
  const repo = new LocalStorageInternalCostsRepository();
  const [migrated] = await repo.list();
  assert.equal(migrated.itemCosts[0].actualUnitCostCents, 80000);
  await repo.save({ ...migrated, itemCosts: [] });
  assert.equal((await repo.list())[0].itemCosts.length, 0);
  assert.equal(storage.get('jc-motors:internal-controls:v1'), legacy);
});
test('datos dañados y errores de escritura se notifican sin sobrescribir datos', async () => {
  const repo = new LocalStorageInternalCostsRepository();
  storage.set(INTERNAL_COSTS_KEY, '{damaged');
  await assert.rejects(repo.list());
  await assert.rejects(repo.save(record()));
  assert.equal(storage.get(INTERNAL_COSTS_KEY), '{damaged');
  storage.clear();
  await assert.rejects(repo.save({ ...record(), itemCosts: [{ quoteItemId: 'p1', actualUnitCostCents: -1 }] }));
  const previous = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  try { await assert.rejects(repo.save(record()), /Quota exceeded/); } finally { localStorage.setItem = previous; }
});
