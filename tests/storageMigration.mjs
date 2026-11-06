import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { migrateStorageKeys } from '../src/storage/migrateStorageKeys.ts';
import { LEGACY_KEY_MIGRATIONS, STORAGE_KEYS } from '../src/storage/storageKeys.ts';
import { LocalStorageInvoiceRepository } from '../src/repositories/LocalStorageInvoiceRepository.ts';
import { LocalStorageInternalCostsRepository } from '../src/repositories/LocalStorageInternalCostsRepository.ts';
import { siguienteFolio } from '../src/services/folioService.ts';

const { data, control } = installMemoryStorage();
beforeEach(() => { data.clear(); control.quota = Infinity; });

const invoices = JSON.stringify([{ uuid: 'u-1', folio: 1 }, { uuid: 'u-2', folio: 2 }]);
const costs = JSON.stringify([{ id: 'r1', quoteId: 'q1', itemCosts: [], additionalExpenses: [{ id: 'e1', description: 'Envío', amountCents: 500 }], createdAt: 'a', updatedAt: 'b' }]);
const seedLegacy = () => {
  data.set('jcmotors.invoices', invoices);
  data.set('jc-motors-internal-costs-v1', costs);
  data.set('jcmotors.folioConsecutivo', '7');
  data.set('jc-motors-sidebar-theme', 'light');
  data.set(STORAGE_KEYS.quotations, '[{"id":"q1"}]');
};
const snapshot = () => JSON.stringify([...data].sort(([a], [b]) => a.localeCompare(b)));

test('#002 (a) copia las claves anteriores, deja las originales y todo se lee igual', async () => {
  seedLegacy();
  const invoicesBefore = await new LocalStorageInvoiceRepository().getAll();
  const costsBefore = await new LocalStorageInternalCostsRepository().list();

  const result = migrateStorageKeys();
  assert.equal(result.status, 'completed');
  assert.equal(result.migrated.length, LEGACY_KEY_MIGRATIONS.length);
  for (const { from, to } of LEGACY_KEY_MIGRATIONS) assert.equal(data.get(to), data.get(from), to);
  assert.equal(data.get('jcmotors.invoices'), invoices, 'la clave anterior no se toca');
  assert.equal(data.get('jc-motors-internal-costs-v1'), costs);
  const marker = JSON.parse(data.get(STORAGE_KEYS.migration));
  assert.ok(marker.date && marker.migrated.length === 4);

  assert.deepEqual(await new LocalStorageInvoiceRepository().getAll(), invoicesBefore);
  assert.deepEqual(await new LocalStorageInternalCostsRepository().list(), costsBefore);
  assert.equal(data.get(STORAGE_KEYS.quotations), '[{"id":"q1"}]');
});

test('#002 (b) segunda ejecución no cambia nada', () => {
  seedLegacy();
  migrateStorageKeys();
  const after = snapshot();
  assert.equal(migrateStorageKeys().status, 'skipped');
  assert.equal(snapshot(), after);
});

test('#002 (c) con la clave nueva ya existente no se sobrescribe', () => {
  seedLegacy();
  data.set(STORAGE_KEYS.invoices, '[{"uuid":"nuevo"}]');
  const result = migrateStorageKeys();
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.kept, [STORAGE_KEYS.invoices]);
  assert.equal(data.get(STORAGE_KEYS.invoices), '[{"uuid":"nuevo"}]');
  assert.equal(data.get('jcmotors.invoices'), invoices);
});

test('#002 (d) con la cuota llena no truena, no marca y la app sigue viendo los datos', async () => {
  seedLegacy();
  control.quota = [...data].reduce((sum, [key, value]) => sum + key.length + value.length, 0) + 10;
  const before = snapshot();
  const result = migrateStorageKeys();
  assert.equal(result.status, 'incomplete');
  assert.ok(result.failed.length > 0);
  assert.equal(data.has(STORAGE_KEYS.migration), false, 'sin marca si algo falló');
  for (const { from } of LEGACY_KEY_MIGRATIONS) assert.ok(data.has(from), `${from} sigue intacta`);
  assert.equal((await new LocalStorageInvoiceRepository().getAll()).length, 2, 'se lee de la clave anterior mientras tanto');
  assert.equal(snapshot(), before, 'un intento fallido no deja copias a medias');

  control.quota = Infinity;
  assert.equal(migrateStorageKeys().status, 'completed', 'el siguiente arranque lo completa');
});

test('#002 el consecutivo de facturas continúa desde el valor anterior', () => {
  data.set('jcmotors.folioConsecutivo', '41');
  migrateStorageKeys();
  assert.equal(siguienteFolio(), 42);
  assert.equal(data.get(STORAGE_KEYS.invoiceFolio), '42');
  assert.equal(data.get('jcmotors.folioConsecutivo'), '41', 'la anterior queda como respaldo');
});

test('#002 una instalación nueva queda marcada y sin claves anteriores', () => {
  const result = migrateStorageKeys();
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.migrated, []);
  assert.ok(data.has(STORAGE_KEYS.migration));
});

test('#002 ninguna clave de localStorage queda suelta fuera de storageKeys.ts', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && name !== 'storageKeys.ts') {
        const text = readFileSync(path, 'utf8');
        if (/['"`](?:jcmotors\.|jc-motors[:-])/.test(text)) offenders.push(path);
      }
    }
  };
  walk(fileURLToPath(new URL('../src', import.meta.url)));
  assert.deepEqual(offenders, []);
});
