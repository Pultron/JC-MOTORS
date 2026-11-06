import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { LocalStorageQuotationRepository } from '../src/repositories/LocalStorageQuotationRepository.ts';
import { quoteDraftService } from '../src/services/quoteDraftService.ts';
import { siguienteFolio } from '../src/services/folioService.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';

const { data } = installMemoryStorage();
beforeEach(() => data.clear());

const input = (name = 'Cliente') => ({
  customer: { name, phone: '6671234567' }, vehicle: { make: 'Nissan', model: 'Sentra', plates: 'ABC123' },
  items: [{ id: `i-${name}`, type: 'part', description: 'Filtro', quantity: 1, saleUnitPrice: 100 }],
  laborDiscountType: 'percentage', laborDiscountValue: 0, includeVat: true, validityDays: 15, publicNotes: '',
});
const counter = () => JSON.parse(data.get(STORAGE_KEYS.quotationFolio) ?? 'null')?.lastNumber;

test('#014 borrar la última cotización cancelada no repite su folio', async () => {
  const repo = new LocalStorageQuotationRepository();
  const created = [];
  for (let n = 1; n <= 5; n += 1) created.push(await repo.create(input(`C${n}`)));
  assert.deepEqual(created.map((q) => q.folio), ['JC-0001', 'JC-0002', 'JC-0003', 'JC-0004', 'JC-0005']);
  await repo.cancel(created[4].id);
  assert.ok(await repo.deleteCancelled(created[4].id));
  assert.equal(counter(), 5, 'borrar no toca el contador');
  assert.equal((await repo.create(input('C6'))).folio, 'JC-0006');
  assert.equal(counter(), 6);
});

test('#014 dos guardados simultáneos no repiten folio', async () => {
  const repo = new LocalStorageQuotationRepository();
  const results = await Promise.all([repo.create(input('A')), repo.create(input('B')), repo.create(input('C'))]);
  assert.equal(new Set(results.map((q) => q.folio)).size, 3);
  assert.equal(counter(), 3);
});

test('#014 primera vez: se inicializa con el mayor folio existente y respeta el formato', async () => {
  const existing = [{ id: 'old-1', folio: 'JC-0041', createdAt: new Date().toISOString(), status: 'Pendiente', items: [], customer: { name: 'X', phone: '' }, vehicle: { make: '', model: '', plates: '' }, validityDays: 15 }];
  data.set(STORAGE_KEYS.quotations, JSON.stringify(existing));
  assert.equal(data.has(STORAGE_KEYS.quotationFolio), false);
  const created = await new LocalStorageQuotationRepository().create(input());
  assert.equal(created.folio, 'JC-0042');
  assert.equal(counter(), 42);
});

test('#014 el contador nunca baja aunque no haya cotizaciones', async () => {
  data.set(STORAGE_KEYS.quotationFolio, JSON.stringify({ lastNumber: 120 }));
  assert.equal((await new LocalStorageQuotationRepository().create(input())).folio, 'JC-0121');
});

test('#014 el folio de un borrador eliminado tampoco se reutiliza', async () => {
  const repo = new LocalStorageQuotationRepository();
  await repo.create(input('A'));
  const form = { customerId: '', customerName: 'B', phone: '', email: '', make: '', model: '', year: '', plates: '', items: [], laborAmount: '', laborDiscountType: 'percentage', laborDiscountValue: '0', ivaEnabled: true, validityDays: '15', publicNotes: '', customerNotes: '' };
  const draft = await quoteDraftService.save(form);
  assert.equal(draft.folio, 'JC-0002');
  quoteDraftService.delete(draft.id);
  assert.equal((await repo.create(input('C'))).folio, 'JC-0003');
});

test('#014 el consecutivo de facturas y el de cotizaciones son independientes', async () => {
  assert.equal(siguienteFolio(), 1);
  assert.equal(siguienteFolio(), 2);
  assert.equal(data.has(STORAGE_KEYS.quotationFolio), false);
  assert.equal((await new LocalStorageQuotationRepository().create(input())).folio, 'JC-0001');
  assert.equal(data.get(STORAGE_KEYS.invoiceFolio), '2');
  assert.equal(siguienteFolio(), 3);
  assert.equal(counter(), 1);
});

test('#014 un contador dañado se respalda y se recalcula con lo existente', async () => {
  data.set(STORAGE_KEYS.quotationFolio, '{dañado');
  const repo = new LocalStorageQuotationRepository();
  await repo.create(input('A'));
  assert.equal((await repo.create(input('B'))).folio, 'JC-0002');
  assert.ok([...data.keys()].some((key) => key.startsWith('jc-motors:backup:quotation-folio:')));
});
