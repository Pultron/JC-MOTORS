import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatMoney, formatMoneyText } from '../src/utils/money.ts';

test('#013 display variant: cents, grouping and rounding', () => {
  assert.equal(formatMoney(0), '$0.00');
  assert.equal(formatMoney(0.5), '$0.50');
  assert.equal(formatMoney(1234.56), '$1,234.56');
  assert.equal(formatMoney(1000000), '$1,000,000.00');
  assert.equal(formatMoney(999999.995), '$1,000,000.00');
  assert.equal(formatMoney(999999.99), '$999,999.99');
});

test('#013 negatives use a leading minus before the symbol', () => {
  assert.equal(formatMoney(-1234.56), '-$1,234.56');
  assert.equal(formatMoney(-0.001), '$0.00');
  assert.equal(formatMoney(-0.5, 'formal'), '-$0.50 MXN');
});

test('#013 NaN and Infinity never print NaN: $0.00 plus a console warning', () => {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    for (const bad of [NaN, Infinity, -Infinity, undefined]) {
      const text = formatMoney(bad);
      assert.equal(text, '$0.00');
      assert.ok(!/NaN|undefined|Infinity/.test(text));
    }
  } finally { console.warn = original; }
  assert.equal(warnings.length, 4);
});

test('#013 variants: pdf has no NBSP, formal puts MXN as a suffix only', () => {
  assert.equal(formatMoney(1234.56, 'pdf'), '$1,234.56');
  assert.ok(!formatMoney(1234.56, 'pdf').includes(' '));
  assert.equal(formatMoney(1234.56, 'formal'), '$1,234.56 MXN');
  for (const variant of ['display', 'pdf', 'formal']) {
    const text = formatMoney(3825, variant);
    assert.ok(!/MXN\s*\$/.test(text) && !text.includes('$$'), `${variant}: ${text}`);
  }
});

test('#049 formatMoneyText keeps the XML digits (no rounding, up to 6 decimals)', () => {
  assert.equal(formatMoneyText('1234.5'), '$1,234.50');
  assert.equal(formatMoneyText('1234'), '$1,234.00');
  assert.equal(formatMoneyText('1234.123456'), '$1,234.123456');
  assert.equal(formatMoneyText('0.005'), '$0.005');
  assert.equal(formatMoneyText('1000000.10'), '$1,000,000.10');
  assert.equal(formatMoneyText(''), '');
  assert.equal(formatMoneyText('abc'), '');
});
