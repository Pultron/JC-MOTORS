import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import {
  appendTemplateItems, checkTemplateName, quoteTemplateService, templateItemsFromForm,
} from '../src/services/quoteTemplateService.ts';
import { applyBackup, buildBackup, parseBackup, serializeBackup } from '../src/storage/backupService.ts';
import { BACKUP_EXPORT_KEYS, STORAGE_KEYS } from '../src/storage/storageKeys.ts';

const { data, control } = installMemoryStorage();
beforeEach(() => { data.clear(); control.quota = Infinity; });

const item = (description, unitPrice = '100', quantity = '1') => ({ description, type: 'part', quantity, unitPrice });
const row = (id, description = 'x', unitPrice = '5') => ({ id, type: 'part', description, quantity: '1', unitPrice });

test('the key is the agreed one and travels in the backup', () => {
  assert.equal(STORAGE_KEYS.templates, 'jc-motors:templates:v1');
  assert.ok(BACKUP_EXPORT_KEYS.includes(STORAGE_KEYS.templates));
});

test('starts empty (nothing preloaded); create / list round trip', () => {
  assert.deepEqual(quoteTemplateService.list(), []);
  const created = quoteTemplateService.create('  Afinación   mayor ', [item('Aceite 5W-30', '450.50', '4'), item('Filtro de aceite')]);
  assert.equal(created.ok, true);
  const [saved] = quoteTemplateService.list();
  assert.equal(saved.name, 'Afinación mayor');
  assert.deepEqual(saved.items[0], { description: 'Aceite 5W-30', type: 'part', quantity: '4', unitPrice: '450.50' });
});

test('corrupt raw: backed up, notice path taken, list is empty and never throws', () => {
  data.set(STORAGE_KEYS.templates, '{no es json');
  assert.deepEqual(quoteTemplateService.list(), []);
  assert.ok([...data.keys()].some((key) => key.startsWith('jc-motors:backup:templates:')), 'raw copy kept');
  data.set(STORAGE_KEYS.templates, JSON.stringify({ not: 'an array' }));
  assert.deepEqual(quoteTemplateService.list(), []);
});

test('invalid entries are skipped, valid ones survive', () => {
  data.set(STORAGE_KEYS.templates, JSON.stringify([
    { id: 'a', name: 'Buena', items: [{ description: 'Pieza', quantity: '2', unitPrice: '10' }], createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', name: '', items: [{ description: 'Pieza' }] },
    { id: 'c', name: 'Sin conceptos', items: [] },
    null,
  ]));
  assert.deepEqual(quoteTemplateService.list().map((t) => t.id), ['a']);
});

test('no limit on the number of templates', () => {
  for (let n = 1; n <= 60; n += 1) assert.equal(quoteTemplateService.create(`Plantilla ${n}`, [item('Pieza')]).ok, true);
  assert.equal(quoteTemplateService.list().length, 60);
});

test('update replaces name and concepts, keeps id and date, validates like create', () => {
  const a = quoteTemplateService.create('Frenos', [item('Balatas')], new Date('2026-01-01T00:00:00.000Z')).value;
  quoteTemplateService.create('Suspensión', [item('Amortiguador')]);
  const done = quoteTemplateService.update(a.id, 'Frenos delanteros', [item('Balatas', '$1,200.50', '2'), { description: 'Mano de obra', type: 'labor', quantity: '', unitPrice: '' }]);
  assert.equal(done.ok, true);
  const saved = quoteTemplateService.list().find((t) => t.id === a.id);
  assert.equal(saved.name, 'Frenos delanteros');
  assert.equal(saved.createdAt, a.createdAt);
  assert.deepEqual(saved.items.map((i) => [i.type, i.quantity, i.unitPrice]), [['part', '2', '$1,200.50'], ['labor', '1', '']]);
  assert.equal(quoteTemplateService.update(a.id, 'suspension', [item('X')]).reason, 'name-duplicate');
  assert.equal(quoteTemplateService.update(a.id, '', [item('X')]).reason, 'name-empty');
  assert.equal(quoteTemplateService.update(a.id, 'Frenos', [item('  ')]).reason, 'no-items');
  assert.equal(quoteTemplateService.update('nope', 'X', [item('X')]).reason, 'not-found');
  assert.equal(quoteTemplateService.update(a.id, 'Frenos delanteros', [item('Otra')]).ok, true, 'own name stays valid');
});

test('items are sanitized like the form: single-line description, money characters only, default quantity', () => {
  const created = quoteTemplateService.create('Limpia', [{ description: ' Aceite\n  5W-30 ', type: 'part', quantity: ' ', unitPrice: ' $4a5,0.50\n' }]);
  assert.deepEqual(created.value.items[0], { description: 'Aceite 5W-30', type: 'part', quantity: '1', unitPrice: '$45,0.50' });
});

test('name validation: empty, too long, duplicates ignore case, accents and spaces', () => {
  assert.equal(quoteTemplateService.create('   ', [item('A')]).reason, 'name-empty');
  assert.equal(quoteTemplateService.create('x'.repeat(61), [item('A')]).reason, 'name-too-long');
  quoteTemplateService.create('Afinación', [item('A')]);
  assert.equal(quoteTemplateService.create(' AFINACION ', [item('A')]).reason, 'name-duplicate');
  assert.equal(quoteTemplateService.create('Otra', []).reason, 'no-items');
  assert.equal(quoteTemplateService.list().length, 1);
});

test('rename keeps its own name valid, rejects other names, delete removes', () => {
  const a = quoteTemplateService.create('Frenos', [item('Balatas')]).value;
  const b = quoteTemplateService.create('Suspensión', [item('Amortiguador')]).value;
  assert.equal(quoteTemplateService.rename(a.id, 'frenos').ok, true, 'case-only change of its own name');
  assert.equal(quoteTemplateService.rename(a.id, 'Suspensión').reason, 'name-duplicate');
  assert.equal(quoteTemplateService.rename(a.id, '').reason, 'name-empty');
  assert.equal(quoteTemplateService.rename('nope', 'X').reason, 'not-found');
  assert.equal(quoteTemplateService.list().find((t) => t.id === a.id).name, 'frenos');
  assert.equal(quoteTemplateService.remove(b.id).ok, true);
  assert.equal(quoteTemplateService.remove(b.id).reason, 'not-found');
  assert.deepEqual(quoteTemplateService.list().map((t) => t.id), [a.id]);
});

test('a full storage reports it and leaves the saved templates untouched', () => {
  quoteTemplateService.create('Primera', [item('A')]);
  const before = data.get(STORAGE_KEYS.templates);
  control.quota = before.length + STORAGE_KEYS.templates.length + 5;
  assert.equal(quoteTemplateService.create('Segunda', [item('B')]).reason, 'storage-full');
  assert.equal(data.get(STORAGE_KEYS.templates), before);
});

test('templateItemsFromForm keeps rows with a description only', () => {
  const items = templateItemsFromForm([row('1', ' Filtro  de aire ', '120'), row('2', '   ', ''), row('3', 'Bujía', '')]);
  assert.deepEqual(items.map((i) => [i.description, i.unitPrice]), [['Filtro de aire', '120'], ['Bujía', '']]);
});

test('appending adds editable copies after the existing concepts', () => {
  let n = 0;
  const result = appendTemplateItems([row('e1', 'Existente')], { items: [item('Nuevo A', '10'), item('Nuevo B', '20')] }, 100, () => `new-${++n}`);
  assert.deepEqual(result.items.map((i) => i.description), ['Existente', 'Nuevo A', 'Nuevo B']);
  assert.deepEqual(result.items.map((i) => i.id), ['e1', 'new-1', 'new-2']);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 0);
});

test('appending respects the 100-concept cap and reports what did not fit', () => {
  const existing = Array.from({ length: 98 }, (_, index) => row(`e${index}`, `Pieza ${index}`));
  const result = appendTemplateItems(existing, { items: [item('A'), item('B'), item('C'), item('D')] });
  assert.equal(result.items.length, 100);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 2);
  const full = appendTemplateItems(Array.from({ length: 100 }, (_, index) => row(`f${index}`, `P${index}`)), { items: [item('A')] });
  assert.equal(full.items.length, 100);
  assert.equal(full.added, 0);
  assert.equal(full.skipped, 1);
});

test('applying a template fills the price and quantity of the new rows', () => {
  const result = appendTemplateItems([row('b', '', '')], { items: [item('Aceite', '450.50', '4'), { description: 'Mano de obra', type: 'labor', quantity: '1', unitPrice: '' }] }, 100, (() => { let n = 0; return () => `n${++n}`; })());
  assert.deepEqual(result.items.map((i) => [i.type, i.description, i.quantity, i.unitPrice]), [['part', 'Aceite', '4', '450.50'], ['labor', 'Mano de obra', '1', '']]);
});

test('a lone blank placeholder row is replaced, but a filled lone row is kept', () => {
  assert.deepEqual(appendTemplateItems([row('b', '', '')], { items: [item('A')] }).items.map((i) => i.description), ['A']);
  assert.deepEqual(appendTemplateItems([row('f', 'Algo', '')], { items: [item('A')] }).items.map((i) => i.description), ['Algo', 'A']);
});

test('checkTemplateName returns the clean name', () => {
  assert.deepEqual(checkTemplateName('  Cambio \t de aceite ', []), { ok: true, value: 'Cambio de aceite' });
});

test('backup: templates are exported and imported; old backups without them stay importable and keep local templates', () => {
  quoteTemplateService.create('Frenos', [item('Balatas')]);
  const file = serializeBackup(buildBackup());
  assert.ok(JSON.parse(file).claves[STORAGE_KEYS.templates]);

  data.clear();
  applyBackup(parseBackup(file), 'replace');
  assert.equal(quoteTemplateService.list()[0].name, 'Frenos');

  // Merge by id does not duplicate.
  applyBackup(parseBackup(file), 'merge');
  assert.equal(quoteTemplateService.list().length, 1);

  // An old backup (no templates key) is valid and, even on replace, does not wipe the templates.
  const old = JSON.stringify({ app: 'jc-motors', schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z', claves: { [STORAGE_KEYS.sidebarTheme]: 'light' } });
  applyBackup(parseBackup(old), 'replace');
  assert.equal(quoteTemplateService.list().length, 1);

  // A malformed templates value is rejected at parse time.
  const bad = JSON.stringify({ app: 'jc-motors', schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z', claves: { [STORAGE_KEYS.templates]: '{oops' } });
  assert.throws(() => parseBackup(bad));
});
