import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { createFakeDb } from './fakeDb.mjs';
import { SqliteRoutedStorage } from '../src/storage/sqliteStorage.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';
import { buildWipeSummary, classifyWipeKey, isWipeConfirmText, keysToWipe, wipeAllData } from '../src/services/wipeService.ts';

const SNAP = 'jc-motors:backup:pre-import:9';

test('isWipeConfirmText accepts BORRAR trimmed and case-insensitive only', () => {
  for (const ok of ['BORRAR', 'borrar', '  Borrar  ', 'bOrRaR\n']) assert.equal(isWipeConfirmText(ok), true, ok);
  for (const bad of ['', ' ', 'borra', 'borrar todo', 'BORRARR', 'B O R R A R']) assert.equal(isWipeConfirmText(bad), false, bad);
});

test('buildWipeSummary pluralizes and handles zero and one', () => {
  assert.equal(buildWipeSummary({ quotations: 12, customers: 8, invoices: 3 }), 'Se borrarán 12 cotizaciones, 8 clientes y 3 facturas.');
  assert.equal(buildWipeSummary({ quotations: 1, customers: 1, invoices: 1 }), 'Se borrarán 1 cotización, 1 cliente y 1 factura.');
  assert.equal(buildWipeSummary({ quotations: 2, customers: 0, invoices: 5 }), 'Se borrarán 2 cotizaciones y 5 facturas.');
  assert.equal(buildWipeSummary({ quotations: 0, customers: 4, invoices: 0 }), 'Se borrarán 4 clientes.');
  assert.equal(buildWipeSummary({ quotations: 1, customers: 0, invoices: 0 }), 'Se borrará 1 cotización.');
  assert.equal(buildWipeSummary({ quotations: 0, customers: 0, invoices: 0 }), 'No hay cotizaciones, clientes ni facturas guardados.');
});

test('classifyWipeKey keeps UI preferences and foreign keys, wipes business data and legacy keys', () => {
  for (const key of [STORAGE_KEYS.sidebarTheme, 'jc-motors-sidebar-theme', 'otra-app:dato', 'theme']) {
    assert.equal(classifyWipeKey(key, true), 'keep', key);
    assert.equal(classifyWipeKey(key, false), 'keep', key);
  }
  const business = [
    STORAGE_KEYS.quotations, STORAGE_KEYS.quoteDrafts, STORAGE_KEYS.quoteAutosave, STORAGE_KEYS.customers, STORAGE_KEYS.templates,
    STORAGE_KEYS.internalControls, STORAGE_KEYS.internalCosts, STORAGE_KEYS.invoices, STORAGE_KEYS.invoiceFolio, STORAGE_KEYS.quotationFolio,
    STORAGE_KEYS.migration, STORAGE_KEYS.schema, STORAGE_KEYS.lastBackup,
    'jcmotors.invoices', 'jc-motors-internal-costs-v1', 'jcmotors.folioConsecutivo', 'jc-motors:backup:pre-import:123',
  ];
  for (const key of business) assert.equal(classifyWipeKey(key, false), 'wipe', key);
});

test('workshop data is wiped only when requested', () => {
  assert.equal(classifyWipeKey(STORAGE_KEYS.businessInfo, false), 'keep');
  assert.equal(classifyWipeKey(STORAGE_KEYS.businessInfo, true), 'wipe');
  assert.deepEqual(keysToWipe([STORAGE_KEYS.businessInfo, STORAGE_KEYS.quotations, STORAGE_KEYS.sidebarTheme], false), [STORAGE_KEYS.quotations]);
});

const seedLocal = (data) => {
  data.clear();
  for (const key of [STORAGE_KEYS.quotations, STORAGE_KEYS.invoiceFolio, STORAGE_KEYS.businessInfo, 'jcmotors.invoices', 'jc-motors:backup:old']) data.set(key, '1');
  data.set(STORAGE_KEYS.sidebarTheme, 'dark');
  data.set('jc-motors-sidebar-theme', 'dark');
  data.set('otra-app:x', 'keep');
};

test('non-Tauri: snapshot first, then removes business keys and keeps preferences and the snapshot', async () => {
  const { data, storage } = installMemoryStorage();
  seedLocal(data);
  const order = [];
  const outcome = await wipeAllData({ includeWorkshop: false }, {
    tauri: false, db: createFakeDb().db, storage, sqlite: undefined,
    safetySnapshot: () => { order.push('snapshot'); data.set(SNAP, 'snap'); return SNAP; },
  });
  assert.deepEqual(order, ['snapshot']);
  assert.deepEqual([...data.keys()].sort(), [STORAGE_KEYS.businessInfo, STORAGE_KEYS.sidebarTheme, 'jc-motors-sidebar-theme', SNAP, 'otra-app:x'].sort());
  assert.equal(outcome.keysRemoved, 4);
  await wipeAllData({ includeWorkshop: true }, { tauri: false, db: createFakeDb().db, storage, sqlite: undefined, safetySnapshot: () => SNAP });
  assert.equal(data.has(STORAGE_KEYS.businessInfo), false);
  assert.equal(data.has(SNAP), true);
});

test('non-Tauri: no snapshot means nothing is deleted', async () => {
  const { data, storage } = installMemoryStorage();
  seedLocal(data);
  const before = [...data];
  await assert.rejects(wipeAllData({ includeWorkshop: true }, { tauri: false, db: createFakeDb().db, storage, sqlite: undefined, safetySnapshot: () => null }));
  assert.deepEqual([...data], before);
});

test('non-Tauri: a failure while removing restores everything already removed', async () => {
  const { data, storage } = installMemoryStorage();
  seedLocal(data);
  const before = new Map(data);
  const realRemove = storage.removeItem;
  let calls = 0;
  storage.removeItem = (key) => { calls += 1; if (calls === 3) throw new Error('boom'); realRemove(key); };
  await assert.rejects(wipeAllData({ includeWorkshop: true }, { tauri: false, db: createFakeDb().db, storage, sqlite: undefined, safetySnapshot: () => SNAP }), /boom/);
  storage.removeItem = realRemove;
  for (const [key, value] of before) assert.equal(data.get(key), value, key);
});

test('Tauri: flushes pending writes, calls Rust, resets the in-memory mirror and clears leftovers', async () => {
  const { data } = installMemoryStorage();
  seedLocal(data);
  const fake = createFakeDb({ [STORAGE_KEYS.quotations]: '[1]', [STORAGE_KEYS.businessInfo]: '{"a":1}' });
  const sqlite = new SqliteRoutedStorage({ apply: fake.db.apply, snapshot: await fake.db.loadSnapshot(), fallback: globalThis.localStorage });
  sqlite.setItem(STORAGE_KEYS.customers, '[2]'); // pending write
  await wipeAllData({ includeWorkshop: false }, { tauri: true, db: fake.db, storage: globalThis.localStorage, sqlite, safetySnapshot: () => null });
  assert.deepEqual(fake.state.wipeCalls, [false]);
  assert.equal(fake.state.applied.flat().some((c) => c.key === STORAGE_KEYS.customers), true, 'pending write flushed before the wipe');
  assert.equal(sqlite.getItem(STORAGE_KEYS.quotations), null);
  assert.equal(sqlite.getItem(STORAGE_KEYS.customers), null);
  assert.equal(sqlite.getItem(STORAGE_KEYS.businessInfo), '{"a":1}');
  assert.equal(sqlite.hasPending, false);
  assert.equal(data.has(STORAGE_KEYS.quotations), false);
  assert.equal(data.has('jcmotors.invoices'), false);
  assert.equal(data.get(STORAGE_KEYS.sidebarTheme), 'dark');
});

test('Tauri: a failing Rust wipe leaves memory and localStorage untouched', async () => {
  const { data } = installMemoryStorage();
  seedLocal(data);
  const before = new Map(data);
  const fake = createFakeDb({ [STORAGE_KEYS.quotations]: '[1]' });
  fake.state.failWipe = true;
  const sqlite = new SqliteRoutedStorage({ apply: fake.db.apply, snapshot: await fake.db.loadSnapshot(), fallback: globalThis.localStorage });
  await assert.rejects(wipeAllData({ includeWorkshop: true }, { tauri: true, db: fake.db, storage: globalThis.localStorage, sqlite, safetySnapshot: () => null }));
  assert.deepEqual([...data], [...before]);
  assert.equal(sqlite.getItem(STORAGE_KEYS.quotations), '[1]');
});
