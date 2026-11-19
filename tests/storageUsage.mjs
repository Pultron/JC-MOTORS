import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { ESTIMATED_QUOTA_CHARS, checkUsageAfterWrite, getStorageUsage, resetUsageWarningForTests, usageLevel, warnIfStorageNearlyFull } from '../src/storage/storageUsage.ts';
import { setAfterWriteHook, writeRaw } from '../src/storage/safeStorage.ts';
import { subscribeStorageNotices } from '../src/storage/storageNotices.ts';
import { DraftStorageFullError, quoteDraftService } from '../src/services/quoteDraftService.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';

const { data, control } = installMemoryStorage();
const notices = [];
subscribeStorageNotices((notice) => notices.push(notice));
beforeEach(() => { data.clear(); control.quota = Infinity; notices.length = 0; resetUsageWarningForTests(); setAfterWriteHook(undefined); });

const fill = (ratio) => data.set('jc-motors:quotations:v1', 'x'.repeat(Math.round(ESTIMATED_QUOTA_CHARS * ratio) - 'jc-motors:quotations:v1'.length));
const DAY = 24 * 60 * 60 * 1000;

test('#004 umbrales de la barra: verde < 70 %, ámbar 70–90 %, rojo > 90 %', () => {
  assert.equal(usageLevel(0.69), 'ok');
  assert.equal(usageLevel(0.7), 'warning');
  assert.equal(usageLevel(0.9), 'warning');
  assert.equal(usageLevel(0.901), 'danger');
});

test('#004 suma solo claves de la app (actuales, anteriores y respaldos) en caracteres de clave + valor', () => {
  data.set('jc-motors:quotations:v1', 'aaaa');
  data.set('jcmotors.invoices', 'bb');
  data.set('jc-motors-sidebar-theme', 'c');
  data.set('jc-motors:backup:quotations:1', 'dd');
  data.set('otra-app:datos', 'x'.repeat(1000));
  const expected = ['jc-motors:quotations:v1', 'jcmotors.invoices', 'jc-motors-sidebar-theme', 'jc-motors:backup:quotations:1']
    .reduce((sum, key) => sum + key.length + data.get(key).length, 0);
  const usage = getStorageUsage();
  assert.equal(usage.usedChars, expected);
  assert.equal(usage.quotaChars, ESTIMATED_QUOTA_CHARS);
  assert.equal(usage.level, 'ok');
});

test('#004 el aviso del 80 % sale una sola vez por sesión', () => {
  fill(0.79);
  warnIfStorageNearlyFull();
  assert.equal(notices.length, 0);
  fill(0.82);
  warnIfStorageNearlyFull();
  warnIfStorageNearlyFull();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].level, 'warning');
  assert.match(notices[0].description, /82 %/);
});

test('#004 tras escribir se revisa el espacio, como mucho cada 30 s', () => {
  setAfterWriteHook(() => checkUsageAfterWrite(1_000_000));
  fill(0.5);
  writeRaw('jc-motors:customers:v1', '[]');
  assert.equal(notices.length, 0);
  fill(0.85);
  writeRaw('jc-motors:customers:v1', '[1]');
  assert.equal(notices.length, 0, 'dentro de la ventana de 30 s no vuelve a medir');
  resetUsageWarningForTests();
  checkUsageAfterWrite(1_000_000 + 31_000);
  assert.equal(notices.length, 1);
});

test('#004 autoguardado con cuota llena: falla con aviso y conserva lo ya guardado', () => {
  const form = (name) => ({ customerId: '', customerName: name, phone: '', email: '', make: '', model: '', year: '', plates: '', items: [], laborDiscountType: 'percentage', laborDiscountValue: '0', ivaEnabled: true, validityDays: '15', publicNotes: '', customerNotes: '' });
  quoteDraftService.saveTemporary(form('Primero'), null);
  const saved = data.get(STORAGE_KEYS.quoteAutosave);
  const drafts = JSON.stringify([{ id: 'd1', folio: 'JC-0001', status: 'Borrador', savedAt: new Date().toISOString(), data: { items: [] } }]);
  data.set(STORAGE_KEYS.quoteDrafts, drafts);
  control.quota = [...data].reduce((sum, [key, value]) => sum + key.length + value.length, 0) + 5;

  assert.throws(() => quoteDraftService.saveTemporary(form('Segundo ' + 'x'.repeat(500)), null), (error) => {
    assert.ok(error instanceof DraftStorageFullError);
    assert.equal(error.message, 'No se pudo guardar el borrador: almacenamiento lleno');
    return true;
  });
  assert.equal(data.get(STORAGE_KEYS.quoteAutosave), saved, 'el borrador temporal anterior sigue igual');
  assert.equal(data.get(STORAGE_KEYS.quoteDrafts), drafts, 'los borradores guardados siguen igual');
  assert.equal(quoteDraftService.getTemporary().data.customerName, 'Primero');
});

test('#004 borra borradores con más de 30 días sin tocar y conserva el resto', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  const draft = (id, savedAt) => ({ id, folio: `JC-${id}`, status: 'Borrador', savedAt, data: { items: [] } });
  data.set(STORAGE_KEYS.quoteDrafts, JSON.stringify([
    draft('0001', new Date(now - 31 * DAY).toISOString()),
    draft('0002', new Date(now - 29 * DAY).toISOString()),
    draft('0003', new Date(now - 400 * DAY).toISOString()),
    { id: 'raro', folio: 'JC-0004', sinFecha: true },
    draft('0005', 'fecha inválida'),
  ]));
  assert.equal(quoteDraftService.purgeStale(now), 2);
  const left = JSON.parse(data.get(STORAGE_KEYS.quoteDrafts));
  assert.deepEqual(left.map((entry) => entry.id), ['0002', 'raro', '0005']);
  assert.equal(notices.at(-1).level, 'info');
  assert.match(notices.at(-1).description, /2 borradores/);
  assert.equal(quoteDraftService.purgeStale(now), 0);
});
