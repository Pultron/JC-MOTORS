import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISCOUNT_CLAMP_MESSAGES, clampDiscount } from '../src/utils/discountClamp.ts';

test('#013-b percentage above 100 clamps to 100 and reports the percentage limit', () => {
  assert.deepEqual(clampDiscount('percentage', 150, 500), { bounded: 100, limit: 'percentage' });
  assert.equal(DISCOUNT_CLAMP_MESSAGES.percentage, 'El descuento se ajustó al máximo: 100 %');
});

test('#013-b fixed discount above the labor subtotal clamps to the subtotal', () => {
  assert.deepEqual(clampDiscount('fixed', 800, 500), { bounded: 500, limit: 'subtotal' });
});

test('#013-b in-range values are untouched, negatives clamp to 0', () => {
  assert.deepEqual(clampDiscount('percentage', 15, 0), { bounded: 15, limit: null });
  assert.deepEqual(clampDiscount('fixed', 500, 500), { bounded: 500, limit: null });
  assert.deepEqual(clampDiscount('percentage', -3, 0), { bounded: 0, limit: 'minimum' });
});
