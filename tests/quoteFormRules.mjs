import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateQuoteForm } from '../src/services/quoteValidation.ts';
import { MAX_YEAR, MIN_YEAR } from '../src/validation/fields.ts';

const totals = { subtotalRefacciones: 100, subtotalManoObra: 0, laborDiscount: 0, subtotalNeto: 100, ivaAmount: 16, total: 116 };
const baseForm = (overrides = {}) => ({
  customerId: '', customerName: 'Ana', phone: '', email: '', make: 'Nissan', model: 'Versa', year: '', plates: '',
  items: [{ id: 'a', type: 'part', description: 'Filtro', quantity: '1', unitPrice: '100' }],
  laborAmount: '', laborDiscountType: 'percentage', laborDiscountValue: '0', ivaEnabled: true, validityDays: '15', publicNotes: '', customerNotes: '',
  ...overrides,
});

test('a valid form has no errors', () => assert.deepEqual(validateQuoteForm(baseForm(), totals), {}));

test('#006 year uses the single MIN_YEAR/MAX_YEAR range', () => {
  assert.equal(validateQuoteForm(baseForm({ year: String(MIN_YEAR) }), totals).year, undefined);
  assert.equal(validateQuoteForm(baseForm({ year: String(MAX_YEAR) }), totals).year, undefined);
  assert.match(validateQuoteForm(baseForm({ year: String(MIN_YEAR - 1) }), totals).year, new RegExp(String(MIN_YEAR)));
  assert.ok(validateQuoteForm(baseForm({ year: String(MAX_YEAR + 1) }), totals).year);
});

const item = (overrides) => ({ id: 'a', type: 'part', description: 'Filtro', quantity: '1', unitPrice: '100', ...overrides });

test('#007 a part needs a whole quantity >= 1; labor/service accepts up to 2 decimals', () => {
  assert.equal(validateQuoteForm(baseForm({ items: [item({ quantity: '3' })] }), totals)['item-a-quantity'], undefined);
  assert.match(validateQuoteForm(baseForm({ items: [item({ quantity: '1.5' })] }), totals)['item-a-quantity'], /entero/);
  assert.ok(validateQuoteForm(baseForm({ items: [item({ quantity: '0' })] }), totals)['item-a-quantity']);
  assert.ok(validateQuoteForm(baseForm({ items: [item({ quantity: '' })] }), totals)['item-a-quantity']);
  assert.equal(validateQuoteForm(baseForm({ items: [item({ type: 'labor', quantity: '1.5' })] }), totals)['item-a-quantity'], undefined);
  assert.ok(validateQuoteForm(baseForm({ items: [item({ type: 'labor', quantity: '1.555' })] }), totals)['item-a-quantity']);
});

test('#007 switching a decimal service row to part errors on that row and keeps the data', () => {
  const row = item({ type: 'labor', quantity: '1.5' });
  assert.equal(validateQuoteForm(baseForm({ items: [row] }), totals)['item-a-quantity'], undefined);
  const switched = { ...row, type: 'part' };
  assert.ok(validateQuoteForm(baseForm({ items: [switched] }), totals)['item-a-quantity']);
  assert.equal(switched.quantity, '1.5');
});
