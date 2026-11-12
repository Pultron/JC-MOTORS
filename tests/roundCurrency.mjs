import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roundCurrency } from '../src/utils/money.ts';
import { roundCurrency as roundFromQuotation } from '../src/utils/quotation.ts';

const legacy = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

test('#016 known tricky values', () => {
  assert.equal(roundCurrency(1.005), 1.01);
  assert.equal(roundCurrency(2.675), 2.68);
  assert.equal(roundCurrency(1.255), 1.26);
  assert.equal(roundCurrency(0.1 + 0.2), 0.3);
  assert.equal(roundCurrency(0.615), 0.62);
  assert.equal(roundCurrency(8.345), 8.35);
  assert.equal(roundCurrency(-1.005), -1.01);
});

test('#016 scientific notation, huge, tiny, negative zero and non-finite', () => {
  assert.equal(roundCurrency(1e21), 1e21);
  assert.equal(roundCurrency(1.5e300), 1.5e300);
  assert.equal(roundCurrency(1e-7), 0);
  assert.ok(Object.is(roundCurrency(-0.001), 0), 'no negative zero');
  assert.ok(Number.isNaN(roundCurrency(NaN)));
  assert.equal(roundCurrency(Infinity), Infinity);
  assert.equal(roundCurrency(-1234.564), -1234.56);
});

test('#016 100 random quantity x price products match integer-cent arithmetic', () => {
  const next = seeded(42);
  for (let i = 0; i < 100; i++) {
    const quantity = 1 + Math.floor(next() * 50);
    const priceCents = Math.floor(next() * 5_000_000);
    const expectedCents = quantity * priceCents;
    assert.equal(Math.round(roundCurrency(quantity * (priceCents / 100)) * 100), expectedCents, `${quantity} x ${priceCents / 100}`);
  }
});

test('#016 does not change any non-negative value the app computed before (stored totals stay identical)', () => {
  const next = seeded(7);
  const quantities = [1, 2, 3, 5, 10, 0.5, 1.5, 2.5, 0.25, 12.75];
  for (let i = 0; i < 50_000; i++) {
    const value = quantities[i % quantities.length] * (Math.floor(next() * 2_000_000) / 100);
    assert.equal(roundCurrency(value), legacy(value), String(value));
  }
});

test('#016 quotation.ts keeps exporting the same function', () => {
  assert.equal(roundFromQuotation, roundCurrency);
});
