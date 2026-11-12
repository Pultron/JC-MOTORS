import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalize, tokenize } from '../src/search/searchCore.ts';
import { searchQuotations } from '../src/search/quotationSearch.ts';

function q(id, folio, name, phone, make, model, year, plates, desc = 'Afinación', extra = {}) {
  return {
    id, folio, createdAt: '2026-01-01T00:00:00.000Z', status: 'Pendiente',
    customer: { name, phone, email: `${id}@correo.com` },
    vehicle: { make, model, year, plates },
    items: [{ id: 'i', type: 'labor', description: desc, quantity: 1, saleUnitPrice: 1, amount: 1 }],
    ...extra,
  };
}

const civic = q('a', 'JC-0001', 'María López', '6671112233', 'Honda', 'Civic', 2018, 'ABC-123');
const perez = q('b', 'JC-0002', 'Juan Pérez', '(667) 351-8806', 'Toyota', 'Hilux', 2020, 'XYZ-987', 'Cambio de balatas');
const five = q('c', 'JC-0005', 'Ana Ruiz', '6675559999', 'Nissan', 'Versa', 2015, 'QQQ-111');
const tricky = q('d', 'JC-0009', 'Luis Soto', '6670015000', 'Ford', 'Ranger', 2010, 'LLL-222');
const toyotaOther = q('e', 'JC-0010', 'Pedro Gil', '6679990000', 'Toyota', 'Corolla', 2012, 'TTT-333');
const all = [civic, perez, five, tricky, toyotaOther];
const ids = (list) => list.map((x) => x.id);

test('normalize strips accents, case and spaces', () => {
  assert.equal(normalize('  PÉREZ   López '), 'perez lopez');
});

test('civic finds Honda Civic; perez finds Pérez', () => {
  assert.deepEqual(ids(searchQuotations(all, 'civic')), ['a']);
  assert.deepEqual(ids(searchQuotations(all, 'perez')), ['b']);
});

test('phone ignores formatting', () => {
  assert.deepEqual(ids(searchQuotations(all, '667 351')), ['b']);
  assert.deepEqual(ids(searchQuotations(all, '(667) 351-8806')), ['b']);
  assert.deepEqual(ids(searchQuotations(all, '6673518806')), ['b']);
});

test('short digits match the folio only', () => {
  assert.deepEqual(ids(searchQuotations(all, '5')), ['c']);
  assert.deepEqual(ids(searchQuotations(all, '0005')), ['c']);
  assert.deepEqual(ids(searchQuotations(all, 'jc-0005')), ['c']);
  assert.deepEqual(ids(searchQuotations(all, 'jc0005')), ['c']);
});

test('4+ digits can match plates, year or phone', () => {
  assert.deepEqual(ids(searchQuotations(all, '2018')), ['a']);
  assert.deepEqual(ids(searchQuotations(all, '5559')), ['c']);
});

test('tokens are ANDed in any order, across fields', () => {
  assert.deepEqual(ids(searchQuotations(all, 'toyota hilux')), ['b']);
  assert.deepEqual(ids(searchQuotations(all, 'hilux toyota')), ['b']);
  assert.deepEqual(ids(searchQuotations(all, 'toyota')), ['b', 'e']);
});

test('matches concepts, email, plates', () => {
  assert.deepEqual(ids(searchQuotations(all, 'balatas')), ['b']);
  assert.deepEqual(ids(searchQuotations(all, 'xyz-987')), ['b']);
  assert.deepEqual(ids(searchQuotations(all, 'a@correo')), ['a']);
});

test('empty query returns everything in the same order', () => {
  assert.deepEqual(ids(searchQuotations(all, '')), ids(all));
  assert.deepEqual(ids(searchQuotations(all, '   ')), ids(all));
});

test('weird characters do not throw', () => {
  for (const s of ['(', '\\', '[', '*', '+', '?', '(((', '\\d', '.*']) {
    assert.doesNotThrow(() => searchQuotations(all, s));
  }
  assert.deepEqual(ids(searchQuotations(all, '(')), ids(all));
});

test('tokenize keeps long numbers as one token', () => {
  assert.deepEqual(tokenize('667 351'), [{ kind: 'number', value: '667351' }]);
});
