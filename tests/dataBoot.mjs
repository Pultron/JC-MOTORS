import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { createFakeDb } from './fakeDb.mjs';
import { bootData, finishBoot, startFresh } from '../src/storage/dataBoot.ts';
import { getStorage, setStorageOverride } from '../src/storage/safeStorage.ts';
import { getActiveSqliteStorage, setActiveSqliteStorage } from '../src/storage/sqliteStorage.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';
import { subscribeStorageNotices } from '../src/storage/storageNotices.ts';

const { data } = installMemoryStorage();
beforeEach(() => { data.clear(); setStorageOverride(undefined); setActiveSqliteStorage(undefined); });

const seedLocal = () => {
  data.set(STORAGE_KEYS.quotations, JSON.stringify([{ id: 'q1', folio: 'JC-0001' }]));
  data.set(STORAGE_KEYS.quotationFolio, JSON.stringify({ lastNumber: 1 }));
  data.set(STORAGE_KEYS.sidebarTheme, 'light');
};
const snapshotLocal = () => JSON.stringify([...data].sort(([a], [b]) => a.localeCompare(b)));
const quiet = async (run) => {
  const original = console.error;
  console.error = () => {};
  try { return await run(); } finally { console.error = original; }
};

test('fuera de Tauri: modo navegador, sin tocar nada', async () => {
  seedLocal();
  const before = snapshotLocal();
  const { db } = createFakeDb();
  assert.deepEqual(await bootData({ db, tauri: false }), { state: 'browser' });
  assert.equal(getActiveSqliteStorage(), undefined);
  assert.equal(snapshotLocal(), before);
});

test('base ya inicializada: carga el snapshot y activa SQLite', async () => {
  const { db } = createFakeDb({ [STORAGE_KEYS.customers]: '[{"id":"c1"}]' });
  seedLocal();
  assert.deepEqual(await bootData({ db, tauri: true }), { state: 'ready' });
  assert.equal(getStorage().getItem(STORAGE_KEYS.customers), '[{"id":"c1"}]');
  assert.equal(getStorage().getItem(STORAGE_KEYS.quotations), null, 'ya no lee localStorage para el negocio');
});

test('base vacía y sin datos locales: pide la bienvenida; «empezar desde cero» activa SQLite', async () => {
  const { db, state } = createFakeDb();
  data.set(STORAGE_KEYS.sidebarTheme, 'dark');
  assert.deepEqual(await bootData({ db, tauri: true }), { state: 'needs-welcome' });
  assert.equal(getActiveSqliteStorage(), undefined);
  await startFresh();
  assert.equal(state.initialized, true);
  assert.ok(getActiveSqliteStorage());
});

test('migración correcta: manda los datos de localStorage a SQLite y los deja intactos', async () => {
  seedLocal();
  const quotations = data.get(STORAGE_KEYS.quotations);
  const { db, state } = createFakeDb();
  assert.deepEqual(await bootData({ db, tauri: true }), { state: 'ready' });
  assert.ok(state.initialized);
  assert.equal(state.store.get(STORAGE_KEYS.quotations), quotations);
  assert.equal(state.store.has(STORAGE_KEYS.sidebarTheme), false, 'el tema no es dato del negocio');
  assert.equal(data.get(STORAGE_KEYS.quotations), quotations, 'localStorage sigue intacto');
  for (const key of [STORAGE_KEYS.quotationFolio, STORAGE_KEYS.sidebarTheme]) assert.ok(data.has(key));
});

test('migración fallida: fallback con localStorage intacto y aviso, sin SQLite', async () => {
  seedLocal();
  const { db, state } = createFakeDb();
  state.failMigrate = true;
  const result = await quiet(() => bootData({ db, tauri: true }));
  assert.equal(result.state, 'fallback');
  assert.match(result.error, /verificación/);
  assert.match(result.notice.description, /no se perdió nada/);
  assert.equal(getActiveSqliteStorage(), undefined);
  assert.equal(getStorage(), globalThis.localStorage);
  assert.equal(JSON.parse(data.get(STORAGE_KEYS.quotations))[0].id, 'q1');
  assert.equal(state.initialized, false);
  const notices = [];
  const off = subscribeStorageNotices((n) => notices.push(n));
  finishBoot(result, { db });
  off();
  assert.equal(notices.length, 1);
});

test('no se pudo abrir la base: fallback sin tocar localStorage', async () => {
  seedLocal();
  const before = snapshotLocal();
  const { db, state } = createFakeDb();
  state.failOpen = true;
  const result = await quiet(() => bootData({ db, tauri: true }));
  assert.equal(result.state, 'fallback');
  assert.equal(snapshotLocal(), before);
});

test('finishBoot con SQLite lanza la copia automática y muestra el aviso pendiente una vez', async () => {
  const { db, state } = createFakeDb({ [STORAGE_KEYS.customers]: '[]' });
  const store = new Map();
  globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  store.set('jcm:pending-toast', JSON.stringify({ level: 'success', title: 'Respaldo restaurado: 1 cotizaciones' }));
  const result = await bootData({ db, tauri: true });
  const notices = [];
  const off = subscribeStorageNotices((n) => notices.push(n));
  finishBoot(result, { db });
  finishBoot(result, { db });
  off();
  assert.equal(state.autoBackups, 2);
  assert.deepEqual(notices.map((n) => n.title), ['Respaldo restaurado: 1 cotizaciones']);
  delete globalThis.sessionStorage;
});
