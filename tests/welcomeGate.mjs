import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { createFakeDb } from './fakeDb.mjs';
import { onDatosBorrados, wipeAllData } from '../src/services/wipeService.ts';
import { clearWelcomeFlag, countBusinessRecords, decideWelcome, isWelcomeDone, markWelcomeDone, resolveWelcomeGate } from '../src/services/welcomeGate.ts';
import { bootData, finishBoot, markFreshInitialized, prepareWelcome } from '../src/storage/dataBoot.ts';
import { setStorageOverride } from '../src/storage/safeStorage.ts';
import { getActiveSqliteStorage, setActiveSqliteStorage } from '../src/storage/sqliteStorage.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';

const { data, storage } = installMemoryStorage();
beforeEach(() => { data.clear(); setStorageOverride(undefined); setActiveSqliteStorage(undefined); });

test('decideWelcome: flag/data matrix', () => {
  assert.equal(decideWelcome({ flag: false, hasData: false }), 'welcome');
  assert.equal(decideWelcome({ flag: false, hasData: true }), 'silent-flag');
  assert.equal(decideWelcome({ flag: true, hasData: false }), 'app');
  assert.equal(decideWelcome({ flag: true, hasData: true }), 'app');
});

test('resolveWelcomeGate: fresh install shows the welcome and writes nothing', () => {
  assert.equal(resolveWelcomeGate(), 'welcome');
  assert.equal(data.size, 0);
  assert.equal(isWelcomeDone(), false);
});

test('resolveWelcomeGate: an older install with data gets the flag silently and never sees the welcome', () => {
  data.set(STORAGE_KEYS.quotations, JSON.stringify([{ id: 'q1' }]));
  assert.equal(resolveWelcomeGate(), 'silent-flag');
  assert.equal(isWelcomeDone(), true);
  assert.equal(resolveWelcomeGate(), 'app');
});

test('countBusinessRecords: quotations + customers + invoices; empty or [] count as zero, unreadable counts as data', () => {
  data.set(STORAGE_KEYS.quotations, '[]');
  data.set(STORAGE_KEYS.customers, '');
  assert.equal(countBusinessRecords(), 0);
  data.set(STORAGE_KEYS.customers, '[{"id":"c"}]');
  data.set(STORAGE_KEYS.invoices, '[{"uuid":"u"},{"uuid":"v"}]');
  assert.equal(countBusinessRecords(), 3);
  data.set(STORAGE_KEYS.quotations, '{broken');
  assert.equal(countBusinessRecords(), 4);
});

test('only drafts or workshop data do not count as business data', () => {
  data.set(STORAGE_KEYS.quoteDrafts, '[{"id":"d"}]');
  data.set(STORAGE_KEYS.businessInfo, '{"nombre":"X"}');
  assert.equal(resolveWelcomeGate(), 'welcome');
});

test('the flag is removed by the wipe (non-Tauri and Tauri paths)', async () => {
  markWelcomeDone();
  data.set(STORAGE_KEYS.quotations, '[1]');
  await wipeAllData({ includeWorkshop: false }, { tauri: false, db: createFakeDb().db, storage, sqlite: undefined, safetySnapshot: () => 'jc-motors:backup:pre-import:1' });
  assert.equal(isWelcomeDone(), false);

  markWelcomeDone();
  await wipeAllData({ includeWorkshop: false }, { tauri: true, db: createFakeDb().db, storage, sqlite: undefined, safetySnapshot: () => null });
  assert.equal(isWelcomeDone(), false);
  assert.equal(resolveWelcomeGate(), 'welcome');
});

test('onDatosBorrados clears the flag even when it was left behind', () => {
  markWelcomeDone();
  onDatosBorrados();
  assert.equal(isWelcomeDone(), false);
  markWelcomeDone();
  clearWelcomeFlag();
  assert.equal(isWelcomeDone(), false);
});

test('welcome boot installs SQLite without writing; "Empezar de cero" only marks initialized', async () => {
  const { db, state } = createFakeDb();
  assert.deepEqual(await bootData({ db, tauri: true }), { state: 'needs-welcome' });
  assert.deepEqual(await prepareWelcome(), { state: 'needs-welcome' });
  assert.ok(getActiveSqliteStorage());
  finishBoot({ state: 'needs-welcome' }, { db, tauri: true });
  assert.equal(state.initialized, false, 'nothing written before the user chooses');
  assert.equal(state.applied.length, 0);
  await markFreshInitialized();
  assert.equal(state.initialized, true);
});

test('after a wipe the database stays initialized but the welcome shows again (flag + zero data decide)', async () => {
  const { db, state } = createFakeDb();
  state.initialized = true;
  assert.deepEqual(await bootData({ db, tauri: true }), { state: 'ready' });
  assert.equal(resolveWelcomeGate(), 'welcome');
});
