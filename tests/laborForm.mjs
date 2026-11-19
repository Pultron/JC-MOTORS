import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_CONCEPTS } from '../src/services/quotationLayout.ts';
import { buildQuotationInput, previewPublicQuotation } from '../src/services/quotationFromForm.ts';
import {
  addLabor, blankItem, formItemsFromQuotation, laborOf, laborSubtotalOf, migrateDraftData, rebaseFixedDiscount, removeLabor, removeService,
} from '../src/services/quoteLaborRows.ts';
import { LABOR_PRICE_REQUIRED_MESSAGE, normalizeQuoteForm, validateQuoteForm } from '../src/services/quoteValidation.ts';
import { calculateQuotationTotals } from '../src/utils/quotation.ts';

const totals = calculateQuotationTotals([], 'percentage', 0, true);
let counter = 0;
const newId = () => `n${++counter}`;
const service = (id, description, quantity, unitPrice) => ({ id, type: 'part', description, quantity: String(quantity), unitPrice: String(unitPrice) });
const form = (items, extra = {}) => ({
  customerId: '', customerName: 'Ana', phone: '(667) 351-8806', email: '', make: 'Nissan', model: 'Versa', year: '2020', plates: 'ABC-123-A',
  items, laborDiscountType: 'percentage', laborDiscountValue: '0', ivaEnabled: true, validityDays: '15', publicNotes: '', customerNotes: '', ...extra,
});

function example() {
  let items = [service('s1', 'Cambio de aceite', 1, 400), service('s2', 'Cambio de llantas', 4, 600), service('s3', 'Checado de aire', 1, 200)];
  for (const [id, price] of [['s1', '150'], ['s2', '200'], ['s3', '50']]) {
    const added = addLabor(items, id, MAX_CONCEPTS, newId);
    items = added.items.map((item) => (item.id === added.laborId ? { ...item, unitPrice: price } : item));
  }
  return items;
}

test('the labor line lands directly below its service, with parentId and quantity 1', () => {
  const items = example();
  assert.deepEqual(items.map((item) => item.id.startsWith('n') ? `L(${item.parentId})` : item.id), ['s1', 'L(s1)', 's2', 'L(s2)', 's3', 'L(s3)']);
  assert.ok(items.filter((item) => item.type === 'labor').every((item) => item.quantity === '1' && item.description === 'Mano de obra'));
});

test('example from the brief: totals through the form, the preview and the saved input', () => {
  const f = form(example(), { laborDiscountValue: '15' });
  assert.deepEqual(validateQuoteForm(f, totals), {});
  const preview = previewPublicQuotation(f);
  assert.equal(preview.subtotalRefacciones, 3000);
  assert.equal(preview.subtotalManoObra, 400);
  assert.equal(preview.laborDiscount, 60);
  assert.equal(preview.subtotalNeto, 3340);
  assert.equal(preview.ivaAmount, 534.4);
  assert.equal(preview.total, 3874.4);
  const input = buildQuotationInput(f);
  assert.equal(input.items.length, 6);
  assert.deepEqual(input.items.filter((item) => item.parentId).map((item) => item.parentId), ['s1', 's2', 's3']);
});

test('a service has zero or one labor line', () => {
  const items = example();
  assert.equal(addLabor(items, 's1', MAX_CONCEPTS, newId), null);
  assert.equal(addLabor(items, 'missing', MAX_CONCEPTS, newId), null);
  assert.equal(laborOf(items, 's2').unitPrice, '200');
});

test('removing a labor line keeps its service; deleting a service deletes its labor too', () => {
  const items = example();
  const laborId = laborOf(items, 's2').id;
  const withoutLabor = removeLabor(items, laborId);
  assert.equal(withoutLabor.length, 5);
  assert.ok(withoutLabor.some((item) => item.id === 's2'));
  assert.equal(laborOf(withoutLabor, 's2'), undefined);
  const withoutService = removeService(items, 's2');
  assert.deepEqual(withoutService.map((item) => item.id).filter((id) => !id.startsWith('n')), ['s1', 's3']);
  assert.equal(withoutService.length, 4);
  assert.equal(laborSubtotalOf(withoutService), 200);
});

test('removing the last row leaves one blank service row', () => {
  const only = [service('s1', 'x', 1, 1)];
  assert.equal(removeService(only, 's1').length, 1);
  assert.equal(removeService(only, 's1')[0].description, '');
});

test('a labor row with an empty price is an error that targets that row, and saving never drops it silently', () => {
  const added = addLabor([service('s1', 'Aceite', 1, 400)], 's1', MAX_CONCEPTS, newId);
  const f = form(added.items);
  const errors = validateQuoteForm(f, totals);
  assert.equal(errors[`item-${added.laborId}-unitPrice`], LABOR_PRICE_REQUIRED_MESSAGE);
  assert.equal(LABOR_PRICE_REQUIRED_MESSAGE, 'Escribe el precio de la mano de obra o quítala');
  // Once removed, the form is valid again.
  assert.deepEqual(validateQuoteForm(form(removeLabor(added.items, added.laborId)), totals), {});
});

test('labor price follows the money rules: negatives, garbage and the per-concept cap', () => {
  const base = (price) => form([service('s1', 'Aceite', 1, 400), { id: 'l1', type: 'labor', description: 'Mano de obra', quantity: '1', unitPrice: price, parentId: 's1' }]);
  assert.equal(validateQuoteForm(base('-5'), totals)['item-l1-unitPrice'], 'No se permiten montos negativos.');
  assert.ok(validateQuoteForm(base('abc'), totals)['item-l1-unitPrice']);
  assert.match(validateQuoteForm(base('10000000'), totals)['item-l1-unitPrice'], /\$9,999,999\.99/);
  assert.equal(validateQuoteForm(base('0'), totals)['item-l1-unitPrice'], undefined);
  assert.equal(normalizeQuoteForm(base('$1,200.50')).items[1].unitPrice, '1200.50');
});

test('the 100-concept cap counts labor rows too', () => {
  let items = Array.from({ length: 99 }, (_, i) => service(`s${i}`, `S${i}`, 1, 1));
  const first = addLabor(items, 's0', MAX_CONCEPTS, newId);
  assert.equal(first.items.length, 100);
  assert.equal(addLabor(first.items, 's1', MAX_CONCEPTS, newId), null);
  assert.equal(validateQuoteForm(form(first.items.map((item) => (item.type === 'labor' ? { ...item, unitPrice: '1' } : item))), totals).items, undefined);
  assert.equal(validateQuoteForm(form([...first.items, blankItem('x', newId)]), totals).items, `Máximo ${MAX_CONCEPTS} conceptos por cotización. Divídela en dos.`);
});

test('with no labor left a fixed discount goes back to 0; percentages are untouched', () => {
  const items = [service('s1', 'Aceite', 1, 400)];
  assert.equal(rebaseFixedDiscount(form(items, { laborDiscountType: 'fixed', laborDiscountValue: '50' })).laborDiscountValue, '0');
  assert.equal(rebaseFixedDiscount(form(items, { laborDiscountType: 'percentage', laborDiscountValue: '10' })).laborDiscountValue, '10');
  const withLabor = addLabor(items, 's1', MAX_CONCEPTS, newId);
  const priced = withLabor.items.map((item) => (item.type === 'labor' ? { ...item, unitPrice: '100' } : item));
  assert.equal(rebaseFixedDiscount(form(priced, { laborDiscountType: 'fixed', laborDiscountValue: '50' })).laborDiscountValue, '50');
});

test('old draft: a labor amount > 0 becomes a loose "Mano de obra" row at the end; empty or 0 creates none', () => {
  const draft = (laborAmount) => ({ ...form([service('s1', 'Aceite', 1, 400)]), laborAmount });
  const migrated = migrateDraftData(draft('350.50'), newId);
  assert.equal('laborAmount' in migrated, false);
  assert.equal(migrated.items.length, 2);
  assert.deepEqual(migrated.items[1], { id: migrated.items[1].id, type: 'labor', description: 'Mano de obra', quantity: '1', unitPrice: '350.50' });
  assert.equal(migrated.items[1].parentId, undefined);
  for (const none of ['', '0', '0.00', undefined, 'abc']) assert.equal(migrateDraftData(draft(none), newId).items.length, 1, String(none));
  // The loose row totals exactly what the old labor amount did.
  assert.equal(previewPublicQuotation(migrated).subtotalManoObra, 350.5);
});

test('editing a Pendiente quotation keeps service+labor pairs, parentIds and loose labor of old quotations', () => {
  const quotation = { items: [
    { id: 's1', type: 'part', description: 'Aceite', quantity: 1, saleUnitPrice: 400, amount: 400 },
    { id: 'l1', type: 'labor', description: 'Mano de obra', quantity: 1, saleUnitPrice: 150, amount: 150, parentId: 's1' },
    { id: 'old', type: 'labor', description: 'Mano de obra', quantity: 1, saleUnitPrice: 80, amount: 80 },
  ] };
  const rows = formItemsFromQuotation(quotation.items);
  assert.deepEqual(rows.map((row) => [row.id, row.type, row.parentId]), [['s1', 'part', undefined], ['l1', 'labor', 's1'], ['old', 'labor', undefined]]);
  const input = buildQuotationInput(form(rows));
  assert.deepEqual(input.items.map((item) => [item.id, item.parentId]), [['s1', undefined], ['l1', 's1'], ['old', undefined]]);
  assert.equal(previewPublicQuotation(form(rows)).subtotalManoObra, 230);
  // The loose row can be removed or edited, but a new loose row cannot be created (labor is only added under a service).
  assert.equal(removeLabor(rows, 'old').length, 2);
  assert.equal(addLabor(rows, 'old', MAX_CONCEPTS, newId), null);
});
