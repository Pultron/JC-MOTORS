import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { appendTemplateItems, quoteTemplateService, templateItemsFromForm, templateRowCount } from '../src/services/quoteTemplateService.ts';
import { applyBackup, buildBackup, parseBackup, serializeBackup } from '../src/storage/backupService.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';
import { previewPublicQuotation } from '../src/services/quotationFromForm.ts';

const { data, control } = installMemoryStorage();
beforeEach(() => { data.clear(); control.quota = Infinity; });

const concept = (description, unitPrice, laborPrice, quantity = '1') => ({ description, type: 'part', quantity, unitPrice, ...(laborPrice === undefined ? {} : { labor: { unitPrice: laborPrice } }) });
const row = (id, description = 'x', unitPrice = '5') => ({ id, type: 'part', description, quantity: '1', unitPrice });
const counter = () => { let n = 0; return () => `new-${++n}`; };

test('a template saves each service with its labor price and reads it back', () => {
  const created = quoteTemplateService.create('Afinación', [concept('Cambio de aceite', '400', '150'), concept('Filtro', '80'), concept('Alineación', '0', '')]);
  assert.equal(created.ok, true);
  const [saved] = quoteTemplateService.list();
  assert.deepEqual(saved.items.map((i) => i.labor), [{ unitPrice: '150' }, undefined, { unitPrice: '' }]);
  assert.equal(templateRowCount(saved.items), 5);
});

test('using a template inserts service+labor pairs with new ids and correct parentIds', () => {
  const template = { items: [concept('Cambio de aceite', '400', '150'), concept('Cambio de llantas', '600', '200', '4')] };
  const ids = counter();
  const result = appendTemplateItems([row('e1', 'Existente')], template, 100, ids);
  assert.deepEqual(result.items.map((i) => [i.id, i.type, i.parentId]), [
    ['e1', 'part', undefined], ['new-1', 'part', undefined], ['new-2', 'labor', 'new-1'], ['new-3', 'part', undefined], ['new-4', 'labor', 'new-3'],
  ]);
  assert.deepEqual(result.items.filter((i) => i.type === 'labor').map((i) => [i.description, i.quantity, i.unitPrice]), [['Mano de obra', '1', '150'], ['Mano de obra', '1', '200']]);
  assert.equal(result.added, 4);
  assert.equal(result.skipped, 0);
  // Using the same template twice never reuses ids.
  const twice = appendTemplateItems(result.items, template, 100, ids);
  assert.equal(new Set(twice.items.map((i) => i.id)).size, twice.items.length);
});

test('an old template (parts only, written before labor existed) still saves, loads and applies', () => {
  data.set(STORAGE_KEYS.templates, JSON.stringify([{ id: 't1', name: 'Viejo', createdAt: '2026-01-01', items: [{ description: 'Balatas', type: 'part', quantity: '2', unitPrice: '1200' }, { description: 'Disco', type: 'part', quantity: '1', unitPrice: '' }] }]));
  const [old] = quoteTemplateService.list();
  assert.equal(old.items.length, 2);
  const result = appendTemplateItems([row('b', '', '')], old, 100, counter());
  assert.deepEqual(result.items.map((i) => [i.description, i.type, i.parentId]), [['Balatas', 'part', undefined], ['Disco', 'part', undefined]]);
  // Editing an old template keeps working and can add labor to it.
  assert.equal(quoteTemplateService.update('t1', 'Viejo', [{ ...old.items[0], labor: { unitPrice: '300' } }, old.items[1]]).ok, true);
  assert.deepEqual(quoteTemplateService.list()[0].items[0].labor, { unitPrice: '300' });
});

test('an old template with a labor-type concept hangs it under the service above it', () => {
  const template = { items: [concept('Aceite', '400'), { description: 'Mano de obra', type: 'labor', quantity: '1', unitPrice: '150' }] };
  const result = appendTemplateItems([row('b', '', '')], template, 100, counter());
  assert.deepEqual(result.items.map((i) => [i.id, i.type, i.parentId]), [['new-1', 'part', undefined], ['new-2', 'labor', 'new-1']]);
});

test('the 100-concept cap counts labor rows and never splits a pair', () => {
  const existing = Array.from({ length: 97 }, (_, index) => row(`e${index}`, `Pieza ${index}`));
  const result = appendTemplateItems(existing, { items: [concept('A', '1', '1'), concept('B', '1', '1'), concept('C', '1')] }, 100, counter());
  assert.equal(result.items.length, 99);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 3);
  assert.ok(result.items.slice(97).every((i, index) => (index === 0 ? i.type === 'part' : i.parentId === result.items[97].id)));
  const full = appendTemplateItems(Array.from({ length: 99 }, (_, index) => row(`f${index}`, `P${index}`)), { items: [concept('A', '1', '1')] }, 100, counter());
  assert.equal(full.items.length, 99);
  assert.equal(full.added, 0);
  assert.equal(full.skipped, 2);
  // A stored template is capped at 100 rows too.
  const many = Array.from({ length: 60 }, (_, index) => concept(`S${index}`, '1', '1'));
  assert.equal(templateRowCount(quoteTemplateService.create('Grande', many).value.items), 100);
});

test('form -> template -> form round trip keeps services, labor and totals', () => {
  const form = [
    { id: 's1', type: 'part', description: 'Cambio de aceite', quantity: '1', unitPrice: '400' },
    { id: 'l1', type: 'labor', description: 'Mano de obra', quantity: '1', unitPrice: '150', parentId: 's1' },
    { id: 's2', type: 'part', description: 'Filtro', quantity: '2', unitPrice: '80' },
  ];
  const items = templateItemsFromForm(form);
  assert.deepEqual(items.map((i) => [i.description, i.labor]), [['Cambio de aceite', { unitPrice: '150' }], ['Filtro', undefined]]);
  const applied = appendTemplateItems([row('b', '', '')], { items }, 100, counter()).items;
  const base = { customerName: 'A', phone: '', email: '', make: 'a', model: 'b', year: '', plates: 'c', customerId: '', laborDiscountType: 'percentage', laborDiscountValue: '0', ivaEnabled: true, validityDays: '15', publicNotes: '', customerNotes: '' };
  const original = previewPublicQuotation({ ...base, items: form });
  const restored = previewPublicQuotation({ ...base, items: applied });
  for (const key of ['subtotalRefacciones', 'subtotalManoObra', 'subtotalNeto', 'ivaAmount', 'total']) assert.equal(restored[key], original[key], key);
});

test('templates with labor survive a backup export and restore', () => {
  quoteTemplateService.create('Afinación', [concept('Cambio de aceite', '400', '150')]);
  const file = serializeBackup(buildBackup(new Date('2026-11-06T12:00:00')));
  data.clear();
  applyBackup(parseBackup(file), 'replace');
  assert.deepEqual(quoteTemplateService.list()[0].items[0].labor, { unitPrice: '150' });
});
