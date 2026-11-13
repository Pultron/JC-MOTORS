import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { createFakeDb } from './fakeDb.mjs';
import { SqliteRoutedStorage } from '../src/storage/sqliteStorage.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';
import {
  CHECK_FAILED_MESSAGE, RESTORE_PHASES, RestoreStepError, applyStagedBackup, backupMeta, classifyRestoreError, failedAfterReplace,
  friendlyRestoreError, restoreDoneMessage, restoreFigures, runRestorePhases, verifyRestoredMatches, verifyStagedSummary,
} from '../src/services/welcomeRestore.ts';

installMemoryStorage();

const info = { kind: 'jcm', fileName: 'Respaldo.jcm', exportedAt: '2026-11-12T18:48:00.000Z', quotations: 12, customers: 8, invoices: 3, lastQuotationFolio: 12, lastInvoiceFolio: 3, hasCurrentData: false, sizeBytes: 2516582 };
const result = { quotations: 12, customers: 8, invoices: 3, lastQuotationFolio: 12, lastInvoiceFolio: 3 };

// ---- error mapping (strings come from src-tauri/src/backup.rs)
test('Rust messages map to friendly texts without technical wording', () => {
  const cases = [
    ['Este archivo no es un respaldo de JC Motors.', 'foreign'],
    ['El archivo está dañado y no se puede leer como respaldo de JC Motors.', 'damaged'],
    ['El respaldo está dañado: la verificación de integridad (huellas) falló.', 'damaged'],
    ['El respaldo está dañado: la base de datos no pasó la verificación de integridad.', 'damaged'],
    ['Este respaldo es de una versión más nueva; actualiza el sistema primero.', 'newer'],
    ['No hay un respaldo preparado. Elige el archivo de nuevo.', 'unavailable'],
    ['El respaldo preparado ya no está disponible. Elige el archivo de nuevo.', 'unavailable'],
    ['os error 5: Access is denied', 'unknown'],
  ];
  for (const [text, kind] of cases) {
    assert.equal(classifyRestoreError(new Error(text)), kind, text);
    assert.equal(classifyRestoreError(text), kind, 'plain strings too');
    const pick = friendlyRestoreError(new Error(text), 'pick');
    assert.match(pick, /No se cambió ningún dato\.$/);
    assert.doesNotMatch(pick, /huellas|integridad|SQLite|os error|Access|sha|hash/i, text);
    assert.match(friendlyRestoreError(new Error(text), 'apply'), /Tus datos quedaron como estaban\.$/);
  }
  assert.equal(classifyRestoreError(undefined), 'unknown');
  assert.match(friendlyRestoreError(new Error('x'), 'apply'), /^No se pudo restaurar el respaldo\./);
});

// ---- builders
test('figures: counts, thousands separator and last folio', () => {
  assert.deepEqual(restoreFigures({ ...info, quotations: 1234 }), [
    { label: 'Cotizaciones', value: '1,234' }, { label: 'Clientes', value: '8' }, { label: 'Facturas', value: '3' }, { label: 'Último folio', value: 'JC-0012' },
  ]);
  assert.equal(restoreFigures({ ...info, lastQuotationFolio: 0 })[3].value, '—');
});

test('meta line: created date and file size, skipping what is unknown', () => {
  assert.match(backupMeta(info), /^Creado el .*2026.* · 2\.4 MB$/);
  assert.match(backupMeta({ ...info, sizeBytes: 0 }), /^Creado el [^·]*$/);
  assert.equal(backupMeta({ exportedAt: 'nope', sizeBytes: 512 }), '512 bytes');
});

test('done message pluralizes and computes the next folio from the restored counter', () => {
  assert.equal(restoreDoneMessage(result), 'Se restauraron 12 cotizaciones, 8 clientes y 3 facturas. La siguiente cotización será JC-0013.');
  assert.equal(restoreDoneMessage({ quotations: 1, customers: 1, invoices: 1, lastQuotationFolio: 1 }), 'Se restauró 1 cotización, 1 cliente y 1 factura. La siguiente cotización será JC-0002.');
  assert.equal(restoreDoneMessage({ quotations: 0, customers: 0, invoices: 0, lastQuotationFolio: 0 }), 'Se restauraron 0 cotizaciones, 0 clientes y 0 facturas. La siguiente cotización será JC-0001.');
});

// ---- real checks
test('staged summary and post-restore comparison', () => {
  assert.doesNotThrow(() => verifyStagedSummary(info));
  assert.throws(() => verifyStagedSummary({ ...info, quotations: -1 }));
  assert.throws(() => verifyStagedSummary({ ...info, kind: 'zip' }));
  assert.doesNotThrow(() => verifyRestoredMatches(info, result));
  assert.doesNotThrow(() => verifyRestoredMatches(info, { ...result, lastQuotationFolio: 20 }), 'counters never go down, so higher is fine');
  assert.throws(() => verifyRestoredMatches(info, { ...result, customers: 7 }));
  assert.throws(() => verifyRestoredMatches(info, { ...result, lastInvoiceFolio: 2 }));
});

// ---- phase sequencer with an injected clock
function fakeClock() {
  const clock = { time: 0, sleeps: [], now: () => clock.time, sleep: async (ms) => { clock.sleeps.push(ms); clock.time += ms; } };
  return clock;
}
const stepsTaking = (clock, durations, log = []) => ({
  verify: async () => { log.push('verify'); clock.time += durations[0]; },
  restore: async () => { log.push('restore'); clock.time += durations[1]; return result; },
  check: async (r) => { log.push(`check:${r.quotations}`); clock.time += durations[2]; },
});

test('phases run in order, each lasts at least 400 ms and never longer than needed', async () => {
  const clock = fakeClock();
  const log = [];
  const events = [];
  const out = await runRestorePhases(stepsTaking(clock, [10, 900, 399], log), { clock, onPhase: (phase, status) => events.push(`${phase}:${status}`) });
  assert.equal(out, result);
  assert.deepEqual(log, ['verify', 'restore', 'check:12']);
  assert.deepEqual(clock.sleeps, [390, 1], 'only the missing time is waited; the slow step is not delayed');
  assert.deepEqual(events, ['verify:active', 'verify:done', 'restore:active', 'restore:done', 'check:active', 'check:done']);
  assert.deepEqual(RESTORE_PHASES.map((p) => p.id), ['verify', 'restore', 'check']);
});

test('a failing step stops the sequence without waiting and names the phase', async () => {
  const clock = fakeClock();
  const events = [];
  const steps = { verify: async () => {}, restore: async () => { throw new Error('No hay un respaldo preparado.'); }, check: async () => assert.fail('must not run') };
  await assert.rejects(runRestorePhases(steps, { clock, onPhase: (p, s) => events.push(`${p}:${s}`) }), (error) => {
    assert.ok(error instanceof RestoreStepError);
    assert.equal(error.phase, 'restore');
    assert.equal(failedAfterReplace(error), false);
    assert.equal(classifyRestoreError(error), 'unavailable');
    return true;
  });
  assert.deepEqual(clock.sleeps, [400], 'only the first (successful) phase waited');
  assert.deepEqual(events, ['verify:active', 'verify:done', 'restore:active']);
});

test('a failing final check is flagged as "after the database was replaced"', async () => {
  const clock = fakeClock();
  const steps = { verify: async () => {}, restore: async () => result, check: async () => { throw new Error('x'); } };
  await assert.rejects(runRestorePhases(steps, { clock }), (error) => failedAfterReplace(error));
  assert.match(CHECK_FAILED_MESSAGE, /copia automática/);
});

// ---- the in-memory mirror is protected around the swap
async function routed(initial = {}) {
  const fake = createFakeDb(initial);
  const sqlite = new SqliteRoutedStorage({ apply: fake.db.apply, snapshot: await fake.db.loadSnapshot(), fallback: globalThis.localStorage });
  return { fake, sqlite };
}

test('applyStagedBackup: flushes before, holds writes during the swap and invalidates the mirror afterwards', async () => {
  const { fake, sqlite } = await routed({ [STORAGE_KEYS.customers]: '[1]' });
  sqlite.setItem(STORAGE_KEYS.businessInfo, '{"a":1}'); // pending before the restore
  const locals = [];
  const db = { applyBackup: async () => {
    assert.equal(fake.state.store.get(STORAGE_KEYS.businessInfo), '{"a":1}', 'pending write was flushed first');
    sqlite.setItem(STORAGE_KEYS.quotations, '[2]'); // a write attempted DURING the swap
    await Promise.resolve();
    return { ...result, localKeys: { [STORAGE_KEYS.sidebarTheme]: 'dark' } };
  } };
  const out = await applyStagedBackup({ db, sqlite, writeLocal: (k, v) => locals.push([k, v]) });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(out.quotations, 12);
  assert.deepEqual(locals, [[STORAGE_KEYS.sidebarTheme, 'dark']]);
  assert.equal(fake.state.store.has(STORAGE_KEYS.quotations), false, 'the stale write never reaches the restored database');
  sqlite.setItem(STORAGE_KEYS.customers, '[9]');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(fake.state.store.get(STORAGE_KEYS.customers), '[1]', 'invalidated mirror writes nothing');
});

test('applyStagedBackup: when the swap fails, held writes are released and sent', async () => {
  const { fake, sqlite } = await routed();
  const db = { applyBackup: async () => { sqlite.setItem(STORAGE_KEYS.customers, '[3]'); throw new Error('boom'); } };
  await assert.rejects(applyStagedBackup({ db, sqlite, writeLocal: () => {} }), /boom/);
  await sqlite.flush();
  assert.equal(fake.state.store.get(STORAGE_KEYS.customers), '[3]');
  sqlite.setItem(STORAGE_KEYS.quotations, '[4]');
  await sqlite.flush();
  assert.equal(fake.state.store.get(STORAGE_KEYS.quotations), '[4]', 'writes work again');
});

test('a failing local preference never fails the restore', async () => {
  const db = { applyBackup: async () => ({ ...result, localKeys: { a: '1' } }) };
  const out = await applyStagedBackup({ db, writeLocal: () => { throw new Error('quota'); } });
  assert.equal(out.customers, 8);
});
