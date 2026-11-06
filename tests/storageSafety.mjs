import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { LocalStorageInternalCostsRepository, INTERNAL_COSTS_KEY } from '../src/repositories/LocalStorageInternalCostsRepository.ts';
import { LocalStorageQuotationRepository } from '../src/repositories/LocalStorageQuotationRepository.ts';
import { LocalStorageInvoiceRepository, INVOICES_STORAGE_KEY } from '../src/repositories/LocalStorageInvoiceRepository.ts';
import { LocalStorageInternalControlRepository } from '../src/repositories/LocalStorageInternalControlRepository.ts';
import { customerService } from '../src/services/customerService.ts';
import { subscribeStorageNotices } from '../src/storage/storageNotices.ts';

const { data, control } = installMemoryStorage();
const notices = [];
subscribeStorageNotices((notice) => notices.push(notice));
beforeEach(() => { data.clear(); control.quota = Infinity; notices.length = 0; });

const backupKeys = (name) => [...data.keys()].filter((key) => key.startsWith(`jc-motors:backup:${name}:`));

test('#001 costos internos dañados: no truena, devuelve lista vacía, respalda el crudo y avisa', async () => {
  const garbage = '{esto no es json #001';
  data.set(INTERNAL_COSTS_KEY, garbage);
  const repo = new LocalStorageInternalCostsRepository();
  assert.deepEqual(await repo.list(), []);
  const [backup] = backupKeys('internal-costs');
  assert.ok(backup, 'debe existir la copia de respaldo');
  assert.equal(data.get(backup), garbage);
  assert.equal(notices.length, 1);
  assert.match(notices[0].description, /Los costos internos estaban dañados; se guardó una copia de respaldo/);
  await repo.list();
  await repo.list();
  assert.equal(backupKeys('internal-costs').length, 1, 'leer varias veces no duplica el respaldo');
  assert.equal(notices.length, 1);
});

test('#001 forma inesperada (no es arreglo de registros válidos) también se respalda', async () => {
  const shape = JSON.stringify({ quoteId: 'q1', forma: 'objeto en lugar de arreglo' });
  data.set(INTERNAL_COSTS_KEY, shape);
  assert.deepEqual(await new LocalStorageInternalCostsRepository().list(), []);
  assert.equal(data.get(backupKeys('internal-costs')[0]), shape);
});

test('#001 guardar tras un dato dañado no pierde la evidencia', async () => {
  const garbage = '[[[ dañado antes de guardar';
  data.set(INTERNAL_COSTS_KEY, garbage);
  const repo = new LocalStorageInternalCostsRepository();
  const record = { id: 'r1', quoteId: 'q1', itemCosts: [], additionalExpenses: [], createdAt: '', updatedAt: '' };
  await repo.save(record);
  assert.equal((await repo.list()).length, 1);
  assert.equal(data.get(backupKeys('internal-costs')[0]), garbage);
});

test('#001 cotizaciones, facturas, control interno y clientes dañados respaldan el crudo', async () => {
  data.set('jc-motors:quotations:v1', 'quotations-garbage');
  data.set(INVOICES_STORAGE_KEY, 'invoices-garbage');
  data.set('jc-motors:internal-controls:v1', 'controls-garbage');
  data.set('jc-motors:customers:v1', 'customers-garbage');
  assert.deepEqual(await new LocalStorageQuotationRepository().list(), []);
  assert.deepEqual(await new LocalStorageInvoiceRepository().getAll(), []);
  assert.deepEqual(await new LocalStorageInternalControlRepository().list(), []);
  assert.deepEqual(customerService.list(), []);
  for (const [name, raw] of [['quotations', 'quotations-garbage'], ['invoices', 'invoices-garbage'], ['internal-controls', 'controls-garbage'], ['customers', 'customers-garbage']]) {
    assert.equal(data.get(backupKeys(name)[0]), raw, name);
  }
  assert.equal(notices.length, 4);
});

test('#001 con el almacenamiento lleno el respaldo falla con aviso y sin lanzar', async () => {
  const garbage = 'x'.repeat(200) + ' lleno';
  data.set(INTERNAL_COSTS_KEY, garbage);
  control.quota = INTERNAL_COSTS_KEY.length + garbage.length + 5;
  assert.deepEqual(await new LocalStorageInternalCostsRepository().list(), []);
  assert.equal(backupKeys('internal-costs').length, 0);
  assert.match(notices[0].description, /almacenamiento está lleno/);
});
