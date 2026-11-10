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
