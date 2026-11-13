import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PER_GROUP, moveActive, searchAll } from '../src/search/globalSearch.ts';

const quote = (id, folio, name, customerId, make, model, plates, price = 1000) => ({
  id, folio, createdAt: '2026-01-01T00:00:00.000Z', status: 'Pendiente', customerId,
  customer: { name, phone: '6671112233', email: `${id}@correo.com` },
  vehicle: { make, model, year: 2018, plates },
  items: [{ id: 'i', type: 'labor', description: 'Afinación', quantity: 1, saleUnitPrice: price, amount: price }],
  laborDiscountType: 'fixed', laborDiscountValue: 0, includeVat: false,
});
const invoice = (folio, uuid, emisor, receptor, total) => ({
  folio, uuid, serieCSD: '00001000000500000000', total,
  emisor: { rfc: 'AAA010101AAA', nombre: emisor, regimenFiscal: '601' },
  receptor: { rfc: 'XAXX010101000', nombre: receptor, regimenFiscal: '616', codigoPostal: '80000', usoCFDI: 'G03' },
  conceptos: [{ descripcion: 'Servicio de afinación' }],
});

const data = {
  quotations: [
    quote('q1', 'JC-0001', 'María López', 'c1', 'Honda', 'Civic', 'ABC-123', 1500),
    quote('q2', 'JC-0002', 'Juan Pérez', 'c2', 'Toyota', 'Hilux', 'XYZ-987'),
  ],
  customers: [
    { id: 'c1', name: 'María López', phone: '6671112233', email: 'maria@correo.com', aliases: [] },
    { id: 'c2', name: 'Juan Pérez', phone: '6673518806', email: 'juan@correo.com', aliases: ['Juanito'] },
  ],
  invoices: [
    invoice(42, '3F2A9C1E-1111-2222-3333-ABCDEF123456', 'Taller JC', 'Refacciones Norte', '1160.00'),
    invoice(7, '99999999-1111-2222-3333-444444444444', 'Taller JC', 'Cliente Dos', '500.00'),
  ],
};

test('civic finds the quotation first, with folio, customer, vehicle and total', () => {
  const [group] = searchAll(data, 'civic');
  assert.equal(group.kind, 'quotation');
  assert.equal(group.results[0].to, '/cotizaciones/q1');
  assert.match(group.results[0].title, /JC-0001 · María López/);
  assert.match(group.results[0].subtitle, /Honda Civic/);
  assert.equal(group.results[0].trailing, '$1,500.00');
});

test('a customer is found by phone, regardless of format', () => {
  for (const q of ['3518806', '(667) 351-8806', '667 351']) {
    const groups = searchAll(data, q);
    const customers = groups.find((g) => g.kind === 'customer');
    assert.equal(customers.results[0].to, '/clientes?cliente=c2', q);
  }
});

test('a customer is found by the plates of their vehicles', () => {
  const customers = searchAll(data, 'xyz-987').find((g) => g.kind === 'customer');
  assert.equal(customers.results[0].to, '/clientes?cliente=c2');
});

test('an invoice is found by internal folio, UUID edges and issuer/receiver', () => {
  for (const q of ['Nº 0042', 'n 0042', '0042', '42', '3f2a9c1e', 'abcdef123456', 'refacciones norte', 'XAXX010101000']) {
    const invoices = searchAll(data, q).find((g) => g.kind === 'invoice');
    assert.ok(invoices, q);
    assert.equal(invoices.results[0].to, '/facturas?uuid=3F2A9C1E-1111-2222-3333-ABCDEF123456', q);
  }
});

test('groups are capped at 5 and report the full total with a "Ver todos" link', () => {
  const many = { ...data, quotations: Array.from({ length: 9 }, (_, i) => quote(`m${i}`, `JC-01${i}0`, 'Cliente Masivo', null, 'Honda', 'Civic', 'AAA-111')) };
  const group = searchAll(many, 'civic').find((g) => g.kind === 'quotation');
  assert.equal(group.results.length, MAX_PER_GROUP);
  assert.equal(group.total, 9);
  assert.equal(group.seeAll, '/historial?q=civic');
});

test('empty or punctuation-only query returns no groups; odd characters never throw', () => {
  assert.deepEqual(searchAll(data, ''), []);
  assert.deepEqual(searchAll(data, '   '), []);
  for (const q of ['(', '\\', '[', '.*']) assert.doesNotThrow(() => searchAll(data, q));
});

test('arrow navigation walks every result of every group and wraps', () => {
  assert.equal(moveActive(-1, 1, 3), 0);
  assert.equal(moveActive(0, 1, 3), 1);
  assert.equal(moveActive(2, 1, 3), 0);
  assert.equal(moveActive(0, -1, 3), 2);
  assert.equal(moveActive(0, 1, 0), -1);
});

