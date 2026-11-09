import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateQuoteForm } from '../src/services/quoteValidation.ts';
import { MAX_CONCEPT_AMOUNT, QuotationAmountError, calculateQuotationTotals } from '../src/utils/quotation.ts';

const item = (saleUnitPrice, quantity = 1, type = 'part') => ({ type, quantity, saleUnitPrice });

test('#016-b totals throw a controlled error when cents are not safe integers', () => {
  for (const bad of [1e20, 9e15, Infinity, NaN]) {
    assert.throws(() => calculateQuotationTotals([item(bad)], 'percentage', 0, true), QuotationAmountError);
  }
  assert.throws(() => calculateQuotationTotals([item(5e9, 5e9)], 'fixed', 0, false), (error) => error.message === 'El monto es demasiado grande');
});

test('#016-b normal and maximum amounts still compute', () => {
  const totals = calculateQuotationTotals([item(MAX_CONCEPT_AMOUNT), item(100, 2, 'labor')], 'percentage', 10, true);
  assert.equal(totals.subtotalRefacciones, 9999999.99);
  assert.equal(totals.subtotalManoObra, 200);
  assert.equal(totals.laborDiscount, 20);
});

const form = (items, extra = {}) => ({
  customerId: '', customerName: 'Ana', phone: '', email: '', make: 'A', model: 'B', year: '', plates: '',
  items, laborAmount: '', laborDiscountType: 'percentage', laborDiscountValue: '0', ivaEnabled: true,
  validityDays: '15', publicNotes: '', customerNotes: '', ...extra,
});
const row = (unitPrice, quantity = '1') => ({ id: 'r1', type: 'part', description: 'x', quantity, unitPrice });
const totals = calculateQuotationTotals([], 'percentage', 0, true);

test('#016-b per-concept cap in the form validation', () => {
  assert.equal(validateQuoteForm(form([row('9999999.99')]), totals)['item-r1-unitPrice'], undefined);
  assert.match(validateQuoteForm(form([row('10000000')]), totals)['item-r1-unitPrice'], /\$9,999,999\.99/);
  assert.match(validateQuoteForm(form([row('5000000', '3')]), totals)['item-r1-unitPrice'], /máximo/i);
  assert.match(validateQuoteForm(form([row('10')], { laborAmount: '10000000' }), totals).laborAmount, /\$9,999,999\.99/);
});

test('#016-c zero-price concepts are allowed (not an error) and counted for the save toast', async () => {
  const { countZeroPriceItems } = await import('../src/utils/quotation.ts');
  assert.equal(countZeroPriceItems([{ saleUnitPrice: 0 }, { saleUnitPrice: 10 }, { saleUnitPrice: 0 }]), 2);
  assert.equal(validateQuoteForm(form([row('0')]), totals)['item-r1-unitPrice'], undefined);
});
