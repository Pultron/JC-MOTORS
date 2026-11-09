import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UUID_1, UUID_8, cfdiXml } from './facturasFixtures.mjs';
import { formatMoney } from '../src/utils/invoiceFormat.ts';

/** The implementation that shipped before #049, kept here as the oracle: digits must never change. */
function legacy(value) {
  if (!value) return '';
  const [entero, decimales = ''] = value.split('.');
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${miles}.${decimales.padEnd(2, '0')}`;
}

test('#049 invoice amounts keep exactly the same digits as before (only the "$" is added)', () => {
  const samples = ['0', '0.5', '12', '999.99', '1000', '1234.5', '1234.56', '12345678.9', '1000000.00', '0.000001', '1234.123456', '116.00', '8000.000000'];
  for (const fixture of [cfdiXml({ uuid: UUID_1, conceptos: 1 }), cfdiXml({ uuid: UUID_8, conceptos: 8 })]) {
    for (const match of fixture.xml.matchAll(/(?:SubTotal|Total|Importe|ValorUnitario|Base)="([\d.]+)"/g)) samples.push(match[1]);
  }
  assert.ok(samples.length > 30);
  for (const value of samples) {
    assert.equal(formatMoney(value), `$${legacy(value)}`, value);
  }
});

test('#049 six decimals are kept, text is never rounded, empty stays empty', () => {
  assert.equal(formatMoney('1234.123456', 6), '$1,234.123456');
  assert.equal(formatMoney('1234.5', 6), '$1,234.500000');
  assert.equal(formatMoney('1234.123456'), '$1,234.123456');
  assert.equal(formatMoney('0.005'), '$0.005');
  assert.equal(formatMoney(''), '');
});
