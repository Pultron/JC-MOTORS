import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildQuotationInput } from '../src/services/quotationFromForm.ts';
import { normalizeQuoteForm, validateQuoteForm } from '../src/services/quoteValidation.ts';
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

test('#009 pasting "$1,234.56" in price validates and saves 1234.56', () => {
  for (const pasted of ['$1,234.56', '1,234.56', '1234.56', ' $ 1,234.56 ']) {
    const form = normalizeQuoteForm(baseForm({ items: [item({ unitPrice: pasted })] }));
    assert.equal(form.items[0].unitPrice, '1234.56', pasted);
    assert.equal(validateQuoteForm(form, totals)['item-a-unitPrice'], undefined, pasted);
    assert.equal(buildQuotationInput(form).items[0].saleUnitPrice, 1234.56, pasted);
    // Even without normalizing (Enter key path) the saved value is the same.
    assert.equal(buildQuotationInput(baseForm({ items: [item({ unitPrice: pasted })] })).items[0].saleUnitPrice, 1234.56, pasted);
  }
});

test('#009 invalid money is a visible field error, never NaN', () => {
  for (const bad of ['abc', '1.2.3', '12,34', '$']) {
    const form = baseForm({ items: [item({ unitPrice: bad })], laborAmount: bad });
    const errors = validateQuoteForm(form, totals);
    assert.ok(errors['item-a-unitPrice'], bad);
    assert.ok(errors.laborAmount, bad);
    assert.ok(buildQuotationInput(form).items.every((entry) => Number.isFinite(entry.saleUnitPrice)));
  }
  assert.ok(validateQuoteForm(baseForm({ items: [item({ unitPrice: '' })] }), totals)['item-a-unitPrice']);
});

test('#009 labor amount accepts the same formats', () => {
  const form = normalizeQuoteForm(baseForm({ laborAmount: '$2,500.50' }));
  assert.equal(form.laborAmount, '2500.50');
  assert.equal(validateQuoteForm(form, totals).laborAmount, undefined);
  const labor = buildQuotationInput(form).items.find((entry) => entry.type === 'labor');
  assert.equal(labor.saleUnitPrice, 2500.5);
});

test('#013-a negatives report "No se permiten montos negativos"', () => {
  const errors = validateQuoteForm(baseForm({ items: [item({ unitPrice: '-100' })], laborAmount: '-5' }), totals);
  assert.equal(errors['item-a-unitPrice'], 'No se permiten montos negativos.');
  assert.equal(errors.laborAmount, 'No se permiten montos negativos.');
});
