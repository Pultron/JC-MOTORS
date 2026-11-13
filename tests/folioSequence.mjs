process.env.TZ = 'America/Mazatlan';
import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { createFakeDb } from './fakeDb.mjs';
import { SqliteRoutedStorage, setActiveSqliteStorage } from '../src/storage/sqliteStorage.ts';
import { setStorageOverride } from '../src/storage/safeStorage.ts';
import { createInvoiceRepository, createQuotationRepository } from '../src/repositories/repositoryFactory.ts';
import { siguienteFolio, formatearFolio } from '../src/services/folioService.ts';
import { buildQuotationInput } from '../src/services/quotationFromForm.ts';

const { data } = installMemoryStorage();
beforeEach(() => { data.clear(); setStorageOverride(undefined); setActiveSqliteStorage(undefined); });

const form = (n) => ({
  customerId: '', customerName: `Cliente ${n}`, phone: '(667) 351-8806', email: '', make: 'Nissan', model: 'Versa', year: '2020', plates: 'ABC-123-A',
  items: [{ id: 'a', type: 'part', description: 'Filtro', quantity: '1', unitPrice: '100' }],
  laborAmount: '', laborDiscountType: 'percentage', laborDiscountValue: '0', ivaEnabled: true, validityDays: '15', publicNotes: '', customerNotes: '',
});
const invoice = (folio) => ({
  folio, uuid: `u-${folio}`, total: '100.00', moneda: 'MXN', receptor: { rfc: 'AAA010101AAA', nombre: 'X', regimenFiscal: '601', codigoPostal: '80020', usoCFDI: 'G03' },
  archivoOriginal: '', archivoTipo: 'xml', archivoNombre: 'a.xml',
});

function useSqliteLikeStorage() {
  const fake = createFakeDb();
  const storage = new SqliteRoutedStorage({ apply: fake.db.apply, snapshot: {}, fallback: globalThis.localStorage, onReverted: () => {} });
  setStorageOverride(storage);
  setActiveSqliteStorage(storage);
}

for (const [label, setup] of [['localStorage', () => {}], ['sqlite-routed storage', useSqliteLikeStorage]]) {
  test(`${label}: quotation folios advance one by one, and never repeat after deleting the last one`, async () => {
    setup();
    const repo = createQuotationRepository();
    const folios = [];
    for (let n = 1; n <= 8; n += 1) folios.push((await repo.create(buildQuotationInput(form(n)))).folio);
    assert.deepEqual(folios, ['JC-0001', 'JC-0002', 'JC-0003', 'JC-0004', 'JC-0005', 'JC-0006', 'JC-0007', 'JC-0008']);
    const last = (await repo.list()).find((quotation) => quotation.folio === 'JC-0008');
    await repo.cancel(last.id);
    await repo.deletePermanently(last.id);
    assert.equal((await repo.create(buildQuotationInput(form(9)))).folio, 'JC-0009');
  });

  test(`${label}: invoice folios advance one by one, and never repeat after deleting the last one`, async () => {
    setup();
    const repo = createInvoiceRepository();
    const folios = [];
    for (let n = 1; n <= 8; n += 1) {
      const folio = siguienteFolio();
      await repo.save(invoice(folio));
      folios.push(formatearFolio(folio));
    }
    assert.deepEqual(folios, ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008']);
    await repo.delete('u-8');
    assert.equal(siguienteFolio(), 9);
  });
}
