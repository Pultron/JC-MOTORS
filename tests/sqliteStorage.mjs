import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { createFakeDb } from './fakeDb.mjs';
import { SqliteRoutedStorage } from '../src/storage/sqliteStorage.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';
import { subscribeStorageNotices } from '../src/storage/storageNotices.ts';

const { data: local } = installMemoryStorage();
const make = (initial = {}) => {
  local.clear();
  const fake = createFakeDb(initial);
  const reverted = [];
  const storage = new SqliteRoutedStorage({ apply: fake.db.apply, snapshot: initial, fallback: globalThis.localStorage, onReverted: (e) => reverted.push(e) });
  return { storage, fake, reverted };
};

test('las claves del negocio van a SQLite y las preferencias se quedan en localStorage', async () => {
  const { storage, fake } = make();
  storage.setItem(STORAGE_KEYS.customers, '[]');
  storage.setItem(STORAGE_KEYS.sidebarTheme, 'light');
  storage.setItem('jc-motors:backup:quotations:1', 'x');
  await storage.flush();
  assert.equal(local.get(STORAGE_KEYS.sidebarTheme), 'light');
  assert.equal(local.get('jc-motors:backup:quotations:1'), 'x');
  assert.equal(local.has(STORAGE_KEYS.customers), false);
  assert.deepEqual(fake.state.applied.flat().map((c) => c.key), [STORAGE_KEYS.customers]);
});

test('lectura inmediata tras escribir y listado de claves', () => {
  const { storage } = make({ [STORAGE_KEYS.quotations]: '[{"id":"a"}]' });
  assert.equal(storage.getItem(STORAGE_KEYS.quotations), '[{"id":"a"}]');
  storage.setItem(STORAGE_KEYS.quotations, '[]');
  assert.equal(storage.getItem(STORAGE_KEYS.quotations), '[]');
  storage.setItem(STORAGE_KEYS.sidebarTheme, 'dark');
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
  assert.ok(keys.includes(STORAGE_KEYS.quotations) && keys.includes(STORAGE_KEYS.sidebarTheme));
  assert.notEqual(storage.getItem(STORAGE_KEYS.migration), null, 'la marca evita resucitar claves anteriores');
});

test('contador y cotización del mismo turno viajan en UN lote (una transacción)', async () => {
  const { storage, fake } = make();
  storage.setItem(STORAGE_KEYS.quotationFolio, '{"lastNumber":1}');
  storage.setItem(STORAGE_KEYS.quotations, '[{"id":"q1"}]');
  storage.setItem(STORAGE_KEYS.quotations, '[{"id":"q1"},{"id":"q2"}]');
  await storage.flush();
  assert.equal(fake.state.applied.length, 1);
  assert.equal(fake.state.applied[0].length, 2);
  assert.equal(fake.state.store.get(STORAGE_KEYS.quotations), '[{"id":"q1"},{"id":"q2"}]');
});

test('escribir el mismo valor no encola nada', async () => {
  const { storage, fake } = make({ [STORAGE_KEYS.customers]: '[]' });
  storage.setItem(STORAGE_KEYS.customers, '[]');
  storage.removeItem(STORAGE_KEYS.quotations);
  assert.equal(storage.hasPending, false);
  await storage.flush();
  assert.equal(fake.state.applied.length, 0);
});

test('borrar una clave manda value null', async () => {
  const { storage, fake } = make({ [STORAGE_KEYS.customers]: '[1]' });
  storage.removeItem(STORAGE_KEYS.customers);
  await storage.flush();
  assert.deepEqual(fake.state.applied[0], [{ key: STORAGE_KEYS.customers, value: null }]);
  assert.equal(storage.getItem(STORAGE_KEYS.customers), null);
});

test('un lote fallido: flush rechaza, la memoria vuelve a lo confirmado, hay aviso y evento', async () => {
  const { storage, fake, reverted } = make({ [STORAGE_KEYS.customers]: '[{"id":"c1"}]' });
  const notices = [];
  const off = subscribeStorageNotices((n) => notices.push(n));
  fake.state.failApply = true;
  storage.setItem(STORAGE_KEYS.customers, '[{"id":"c1"},{"id":"c2"}]');
  storage.setItem(STORAGE_KEYS.templates, '[{"id":"t"}]');
  assert.equal(storage.getItem(STORAGE_KEYS.customers), '[{"id":"c1"},{"id":"c2"}]');
  await assert.rejects(storage.flush(), /disco lleno/);
  assert.equal(storage.getItem(STORAGE_KEYS.customers), '[{"id":"c1"}]');
  assert.equal(storage.getItem(STORAGE_KEYS.templates), null);
  assert.equal(reverted.length, 1);
  assert.equal(notices[0].level, 'error');
  assert.match(notices[0].description, /intactos/);
  assert.equal(fake.state.store.get(STORAGE_KEYS.customers), '[{"id":"c1"}]');
  off();

  fake.state.failApply = false;
  storage.setItem(STORAGE_KEYS.customers, '[]');
  await storage.flush();
  assert.equal(fake.state.store.get(STORAGE_KEYS.customers), '[]');
});
