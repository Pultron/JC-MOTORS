import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { createFakeDb } from './fakeDb.mjs';
import { SqliteRoutedStorage, setActiveSqliteStorage } from '../src/storage/sqliteStorage.ts';
import { setStorageOverride } from '../src/storage/safeStorage.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';
import { createQuotationRepository, createInvoiceRepository, createInternalControlRepository, createInternalCostsRepository } from '../src/repositories/repositoryFactory.ts';
import { LocalStorageQuotationRepository } from '../src/repositories/LocalStorageQuotationRepository.ts';
import { SqliteQuotationRepository } from '../src/repositories/SqliteQuotationRepository.ts';
import { SqliteInvoiceRepository } from '../src/repositories/SqliteInvoiceRepository.ts';

const { data } = installMemoryStorage();
let fake;
const activate = () => {
  fake = createFakeDb();
  const storage = new SqliteRoutedStorage({ apply: fake.db.apply, snapshot: {}, fallback: globalThis.localStorage, onReverted: () => {} });
  setStorageOverride(storage);
  setActiveSqliteStorage(storage);
  return storage;
};
const deactivate = () => { setStorageOverride(undefined); setActiveSqliteStorage(undefined); };
beforeEach(() => { data.clear(); deactivate(); });

const input = (name) => ({ customer: { name, phone: '6671234567' }, vehicle: { make: 'Nissan', model: 'Sentra', plates: 'ABC' }, items: [{ id: `i-${name}`, type: 'part', description: 'Filtro', quantity: 1, saleUnitPrice: 100 }], laborDiscountType: 'percentage', laborDiscountValue: 0, includeVat: true, validityDays: 3650, publicNotes: '' });

test('la fábrica elige localStorage fuera de SQLite y Sqlite* con el almacén instalado', () => {
  assert.ok(createQuotationRepository() instanceof LocalStorageQuotationRepository);
  assert.equal(createQuotationRepository() instanceof SqliteQuotationRepository, false);
  activate();
  assert.ok(createQuotationRepository() instanceof SqliteQuotationRepository);
  assert.ok(createInvoiceRepository() instanceof SqliteInvoiceRepository);
  assert.ok(createInternalControlRepository());
  assert.ok(createInternalCostsRepository());
});

test('crear una cotización espera la confirmación y deja cotización y contador en SQLite', async () => {
  activate();
  const repo = createQuotationRepository();
  const quote = await repo.create(input('Ana'));
  assert.equal(quote.folio, 'JC-0001');
  assert.equal(fake.state.applied.length, 1, 'contador + cotización en una transacción');
  assert.equal(JSON.parse(fake.state.store.get(STORAGE_KEYS.quotations))[0].id, quote.id);
  assert.equal(JSON.parse(fake.state.store.get(STORAGE_KEYS.quotationFolio)).lastNumber, 1);
  assert.equal(data.has(STORAGE_KEYS.quotations), false, 'localStorage no se toca');
});

test('si SQLite falla, create lanza y el estado queda igual que antes', async () => {
  activate();
  const repo = createQuotationRepository();
  await repo.create(input('Ana'));
  const before = JSON.stringify([...fake.state.store]);
  fake.state.failApply = true;
  await assert.rejects(repo.create(input('Luis')), /disco lleno/);
  assert.equal(JSON.stringify([...fake.state.store]), before);
  assert.equal((await repo.list()).length, 1);
  fake.state.failApply = false;
  assert.equal((await repo.create(input('Luis'))).folio, 'JC-0002', 'el folio no se perdió ni se repitió');
});

test('las facturas también esperan la confirmación', async () => {
  activate();
  const repo = createInvoiceRepository();
  await repo.save({ uuid: 'u-1', folio: 1 });
  fake.state.failApply = true;
  await assert.rejects(repo.save({ uuid: 'u-2', folio: 2 }), /disco lleno/);
  assert.deepEqual((await repo.getAll()).map((i) => i.uuid), ['u-1']);
});
