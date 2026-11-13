import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import {
  BackupError, applyBackup, backupFileName, buildBackup, daysSinceLastBackup, formatSummary, markBackupExported, parseBackup,
  saveSafetySnapshot, serializeBackup, shouldRemindBackup, summarizeBackup,
} from '../src/storage/backupService.ts';
import { migrateStorageKeys } from '../src/storage/migrateStorageKeys.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';
import { LocalStorageQuotationRepository } from '../src/repositories/LocalStorageQuotationRepository.ts';

const { data, control } = installMemoryStorage();
beforeEach(() => { data.clear(); control.quota = Infinity; });

const quotation = (n) => ({ id: `q-${n}`, folio: `JC-${String(n).padStart(4, '0')}`, createdAt: '2026-10-01T10:00:00.000Z', status: 'Pendiente', customer: { name: `Cliente ${n}`, phone: '6671234567' }, vehicle: { make: 'Nissan', model: 'Sentra', plates: 'ABC' }, items: [{ id: `i-${n}`, type: 'part', description: 'Filtro', quantity: 1, saleUnitPrice: 100, amount: 100 }], laborDiscountType: 'percentage', laborDiscountValue: 0, includeVat: true, subtotalNeto: 100, ivaAmount: 16, total: 116, validityDays: 3650, publicNotes: '', customerNotes: '' });
const seed = () => {
  data.set(STORAGE_KEYS.quotations, JSON.stringify([quotation(3), quotation(2), quotation(1)]));
  data.set(STORAGE_KEYS.customers, JSON.stringify([{ id: 'c1', name: 'Ana', aliases: [] }, { id: 'c2', name: 'Luis', aliases: ['Lu'] }]));
  data.set(STORAGE_KEYS.invoices, JSON.stringify([{ uuid: 'u-1', folio: 1 }, { uuid: 'u-2', folio: 2 }]));
  data.set(STORAGE_KEYS.internalCosts, JSON.stringify([{ id: 'r1', quoteId: 'q-1', itemCosts: [], additionalExpenses: [], createdAt: 'a', updatedAt: 'b' }]));
  data.set(STORAGE_KEYS.internalControls, JSON.stringify([{ id: 'ic1', quotationId: 'q-1', partCosts: [] }]));
  data.set(STORAGE_KEYS.quotationFolio, JSON.stringify({ lastNumber: 9 }));
  data.set(STORAGE_KEYS.invoiceFolio, '4');
  data.set(STORAGE_KEYS.sidebarTheme, 'light');
};
const snapshot = () => JSON.stringify([...data].sort(([a], [b]) => a.localeCompare(b)));

test('M02 exportar → vaciar → importar deja todo igual, contador de folio incluido', async () => {
  seed();
  const file = serializeBackup(buildBackup(new Date('2026-11-06T12:00:00')));
  const before = snapshot();
  data.clear();

  const result = applyBackup(parseBackup(file), 'replace');
  assert.equal(snapshot().includes('backup'), false);
  for (const key of [STORAGE_KEYS.quotations, STORAGE_KEYS.customers, STORAGE_KEYS.invoices, STORAGE_KEYS.internalCosts, STORAGE_KEYS.internalControls, STORAGE_KEYS.invoiceFolio, STORAGE_KEYS.sidebarTheme]) {
    assert.equal(data.get(key), JSON.parse(before).find(([name]) => name === key)[1], key);
  }
  assert.equal(JSON.parse(data.get(STORAGE_KEYS.quotationFolio)).lastNumber, 9);
  assert.equal(result.summary.quotations, 3);
  const folios = (await new LocalStorageQuotationRepository().list()).map((q) => q.folio);
  assert.deepEqual(folios, ['JC-0003', 'JC-0002', 'JC-0001']);
});

test('M02 el archivo solo lleva datos del negocio: sin borradores, autoguardado, copias ni metadatos', () => {
  seed();
  data.set(STORAGE_KEYS.quoteDrafts, '[]');
  data.set(STORAGE_KEYS.quoteAutosave, '{}');
  data.set('jc-motors:backup:quotations:1', 'x');
  data.set(STORAGE_KEYS.migration, '{}');
  const backup = buildBackup();
  assert.deepEqual(Object.keys(backup.claves).sort(), [STORAGE_KEYS.quotations, STORAGE_KEYS.customers, STORAGE_KEYS.internalControls, STORAGE_KEYS.internalCosts, STORAGE_KEYS.invoices, STORAGE_KEYS.invoiceFolio, STORAGE_KEYS.quotationFolio, STORAGE_KEYS.sidebarTheme].sort());
  assert.equal(backup.app, 'jc-motors');
  assert.equal(backup.schemaVersion, 1);
});

test('M02 un archivo inválido se rechaza y no cambia nada', () => {
  seed();
  const before = snapshot();
  const valid = JSON.parse(serializeBackup(buildBackup()));
  const bad = [
    'esto no es json',
    '[]',
    JSON.stringify({ ...valid, app: 'otra-app' }),
    JSON.stringify({ ...valid, schemaVersion: 99 }),
    JSON.stringify({ ...valid, schemaVersion: 'uno' }),
    JSON.stringify({ ...valid, exportedAt: 'ayer' }),
    JSON.stringify({ ...valid, claves: 'nada' }),
    JSON.stringify({ ...valid, claves: { 'jc-motors:meta:migration:v1': '{}' } }),
    JSON.stringify({ ...valid, claves: { [STORAGE_KEYS.quotations]: '{no es arreglo' } }),
    JSON.stringify({ ...valid, claves: { [STORAGE_KEYS.quotations]: '{"a":1}' } }),
    JSON.stringify({ ...valid, claves: { [STORAGE_KEYS.quotationFolio]: '{"lastNumber":-5}' } }),
    JSON.stringify({ ...valid, claves: { [STORAGE_KEYS.invoiceFolio]: 'abc' } }),
    JSON.stringify({ ...valid, claves: { [STORAGE_KEYS.customers]: 5 } }),
  ];
  for (const text of bad) assert.throws(() => parseBackup(text), BackupError, text.slice(0, 60));
  assert.equal(snapshot(), before);
});

test('M02 combinar no duplica, conserva lo local y suma lo nuevo', () => {
  seed();
  const file = parseBackup(serializeBackup(buildBackup()));
  const again = applyBackup(file, 'merge');
  assert.equal(JSON.parse(data.get(STORAGE_KEYS.quotations)).length, 3);
  assert.equal(JSON.parse(data.get(STORAGE_KEYS.customers)).length, 2);
  assert.equal(JSON.parse(data.get(STORAGE_KEYS.invoices)).length, 2);
  assert.equal(again.folioConflicts, 0);

  const incoming = {
    ...file,
    claves: {
      ...file.claves,
      [STORAGE_KEYS.quotations]: JSON.stringify([{ ...quotation(1), customer: { name: 'DISTINTO', phone: '' } }, quotation(7)]),
      [STORAGE_KEYS.customers]: JSON.stringify([{ id: 'c3', name: 'Nuevo', aliases: [] }, { id: 'c1', name: 'Pisado', aliases: [] }]),
    },
  };
  applyBackup(parseBackup(JSON.stringify(incoming)), 'merge');
  const quotations = JSON.parse(data.get(STORAGE_KEYS.quotations));
  assert.equal(quotations.length, 4);
  assert.equal(quotations.find((q) => q.id === 'q-1').customer.name, 'Cliente 1', 'lo local gana en un id repetido');
  assert.ok(quotations.some((q) => q.id === 'q-7'));
  const customers = JSON.parse(data.get(STORAGE_KEYS.customers));
  assert.deepEqual(customers.map((c) => c.id), ['c1', 'c2', 'c3']);
  assert.equal(customers[0].name, 'Ana');
});

test('M02 los consecutivos de folio se quedan con el mayor, también en Reemplazar', () => {
  seed();
  const file = JSON.parse(serializeBackup(buildBackup()));
  for (const mode of ['merge', 'replace']) {
    data.set(STORAGE_KEYS.quotationFolio, JSON.stringify({ lastNumber: 50 }));
    data.set(STORAGE_KEYS.invoiceFolio, '30');
    applyBackup(parseBackup(JSON.stringify(file)), mode);
    assert.equal(JSON.parse(data.get(STORAGE_KEYS.quotationFolio)).lastNumber, 50, `${mode}: el local es mayor`);
    assert.equal(data.get(STORAGE_KEYS.invoiceFolio), '30');
  }
  data.set(STORAGE_KEYS.quotationFolio, JSON.stringify({ lastNumber: 2 }));
  data.set(STORAGE_KEYS.invoiceFolio, '1');
  applyBackup(parseBackup(JSON.stringify(file)), 'merge');
  assert.equal(JSON.parse(data.get(STORAGE_KEYS.quotationFolio)).lastNumber, 9, 'el archivo es mayor');
  assert.equal(data.get(STORAGE_KEYS.invoiceFolio), '4');
});

test('M02 el contador sube hasta el mayor folio realmente importado', () => {
  const file = { app: 'jc-motors', schemaVersion: 1, exportedAt: new Date().toISOString(), claves: { [STORAGE_KEYS.quotations]: JSON.stringify([quotation(77)]), [STORAGE_KEYS.invoices]: JSON.stringify([{ uuid: 'u', folio: 12 }]) } };
  applyBackup(parseBackup(JSON.stringify(file)), 'merge');
  assert.equal(JSON.parse(data.get(STORAGE_KEYS.quotationFolio)).lastNumber, 77);
  assert.equal(data.get(STORAGE_KEYS.invoiceFolio), '12');
});

test('M02 reemplazar quita lo que el archivo no trae, salvo los consecutivos', () => {
  seed();
  const file = { app: 'jc-motors', schemaVersion: 1, exportedAt: new Date().toISOString(), claves: { [STORAGE_KEYS.quotations]: JSON.stringify([quotation(1)]) } };
  const result = applyBackup(parseBackup(JSON.stringify(file)), 'replace');
  assert.equal(JSON.parse(data.get(STORAGE_KEYS.quotations)).length, 1);
  assert.equal(data.has(STORAGE_KEYS.customers), false);
  assert.equal(data.has(STORAGE_KEYS.invoices), false);
  assert.equal(JSON.parse(data.get(STORAGE_KEYS.quotationFolio)).lastNumber, 9);
  assert.equal(data.get(STORAGE_KEYS.sidebarTheme), 'light', 'la preferencia local se conserva si el archivo no la trae');
  assert.equal(result.summary.customers, 0);
});

test('M02 si la importación falla a medias se restaura todo', () => {
  seed();
  migrateStorageKeys(); // en la app la marca ya existe tras el arranque
  const before = snapshot();
  const file = parseBackup(serializeBackup(buildBackup()));
  const bigger = { ...file, claves: { ...file.claves, [STORAGE_KEYS.quotations]: JSON.stringify([quotation(1), quotation(2), quotation(3), ...Array.from({ length: 40 }, (_, i) => quotation(100 + i))]) } };
  control.quota = [...data].reduce((sum, [key, value]) => sum + key.length + value.length, 0) + 200;
  assert.throws(() => applyBackup(parseBackup(JSON.stringify(bigger)), 'merge'));
  control.quota = Infinity;
  assert.equal(snapshot(), before);
});

test('M02 la copia previa a importar guarda todo el estado y solo conserva la última', () => {
  seed();
  data.set(STORAGE_KEYS.quoteDrafts, '[{"id":"d"}]');
  assert.equal(saveSafetySnapshot(new Date(1000)), true);
  assert.equal(saveSafetySnapshot(new Date(2000)), true);
  const keys = [...data.keys()].filter((key) => key.startsWith('jc-motors:backup:pre-import:'));
  assert.deepEqual(keys, ['jc-motors:backup:pre-import:2000']);
  const stored = JSON.parse(data.get(keys[0]));
  assert.equal(stored.claves[STORAGE_KEYS.quoteDrafts], '[{"id":"d"}]');
  assert.equal(stored.claves[STORAGE_KEYS.quotations], data.get(STORAGE_KEYS.quotations));

  control.quota = [...data].reduce((sum, [key, value]) => sum + key.length + value.length, 0) + 10;
  assert.equal(saveSafetySnapshot(new Date(3000)), false, 'sin espacio avisa para ofrecer un archivo');
  assert.ok(data.has('jc-motors:backup:pre-import:2000'), 'la copia anterior no se pierde si la nueva no cupo');
});

test('M02 nombre de archivo, resumen en español y aviso de 7 días', () => {
  assert.equal(backupFileName(new Date(2026, 10, 6)), 'Respaldo JC Motors - 2026-11-06');
  assert.equal(formatSummary({ quotations: 32, invoices: 5, customers: 18, internalCosts: 0, internalControls: 0 }), '32 cotizaciones, 5 facturas, 18 clientes');
  assert.equal(formatSummary({ quotations: 1, invoices: 1, customers: 1, internalCosts: 2, internalControls: 0 }), '1 cotización, 1 factura, 1 cliente, 2 registros de costos');
  assert.equal(shouldRemindBackup(), false, 'sin datos no se molesta');
  seed();
  assert.equal(shouldRemindBackup(), true, 'hay datos y nunca hubo respaldo');
  const now = Date.parse('2026-11-30T12:00:00Z');
  markBackupExported('2026-11-25T12:00:00Z');
  assert.equal(daysSinceLastBackup(now), 5);
  assert.equal(shouldRemindBackup(now), false);
  markBackupExported('2026-11-23T12:00:00Z');
  assert.equal(daysSinceLastBackup(now), 7);
  assert.equal(shouldRemindBackup(now), false, 'exactamente 7 días todavía no avisa');
  markBackupExported('2026-11-21T12:00:00Z');
  assert.equal(daysSinceLastBackup(now), 9);
  assert.equal(shouldRemindBackup(now), true);
  assert.equal(summarizeBackup(buildBackup()).quotations, 3);
});
