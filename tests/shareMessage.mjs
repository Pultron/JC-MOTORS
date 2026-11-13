process.env.TZ = 'America/Mazatlan'; // UTC-7: a UTC-based "valid until" would be a day late near midnight UTC
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_MESSAGE_TEMPLATE, MESSAGE_VARIABLES, buildShareMessage, firstName, previewMessage, renderTemplate, vehicleLabel,
} from '../src/services/shareMessage.ts';

const business = { nombre: 'JC Motors', telefonos: ['(667) 351-8806'] };
const quotation = (overrides = {}) => ({
  businessName: 'JC Motors', folio: 'JC-0005', createdAt: '2026-11-12T18:00:00.000Z',
  customer: { name: 'Carlos Méndez Soto', phone: '6671234567' },
  vehicle: { make: 'Nissan', model: 'Sentra', year: 2022, plates: 'ABC123' },
  items: [], laborDiscount: 0, subtotalRefacciones: 0, subtotalManoObra: 0, subtotalNeto: 0, includeVat: true, ivaAmount: 0,
  total: 4350, validityDays: 15, publicNotes: '', ...overrides,
});

test('default template is the agreed text, byte for byte', () => {
  assert.equal(DEFAULT_MESSAGE_TEMPLATE, 'Hola {nombre}, te comparto la cotización {folio} de {taller} para tu {vehiculo}.\nTotal: {total}\nVigente hasta: {vigencia}\nCualquier duda, estamos a tus órdenes.\n{taller} · {telefono_taller}');
});

test('all variables are replaced', () => {
  const { text } = buildShareMessage(quotation(), business);
  assert.equal(text, [
    'Hola Carlos, te comparto la cotización JC-0005 de JC Motors para tu Nissan Sentra 2022.',
    'Total: $4,350.00',
    'Vigente hasta: 27 de noviembre de 2026',
    'Cualquier duda, estamos a tus órdenes.',
    'JC Motors · (667) 351-8806',
  ].join('\n'));
});

test('subject is "Cotización folio · taller" and the email body is the same text', () => {
  const message = buildShareMessage(quotation(), business);
  assert.equal(message.subject, 'Cotización JC-0005 · JC Motors');
});

test('no vehicle: the " para tu {vehiculo}" phrase disappears and spacing stays clean', () => {
  const { text } = buildShareMessage(quotation({ vehicle: { make: '', model: '', plates: '' } }), business);
  assert.equal(text.split('\n')[0], 'Hola Carlos, te comparto la cotización JC-0005 de JC Motors.');
  assert.doesNotMatch(text, /\{|  | \./);
});

test('vehicle without year keeps make and model only', () => {
  assert.equal(vehicleLabel({ make: 'Nissan', model: 'Sentra' }), 'Nissan Sentra');
  assert.equal(vehicleLabel({ make: ' ', model: '', year: 2020 }), '2020');
});

test('first name is the first token only (documented: "María José" -> "María")', () => {
  assert.equal(firstName('María José Pérez'), 'María');
  assert.equal(firstName('  Ana  '), 'Ana');
  assert.equal(firstName(''), '');
});

test('unknown variables are left untouched, values are inserted literally', () => {
  const values = { nombre: 'A$&B', folio: 'F', taller: 'T', vehiculo: '', total: '$1', vigencia: 'V', telefono_taller: 'P' };
  assert.equal(renderTemplate('{nombre} {desconocido} {total}', values), 'A$&B {desconocido} $1');
});

test('a custom template is used, a blank one falls back to the default', () => {
  assert.match(buildShareMessage(quotation(), { ...business, mensajeClientes: 'Hola {nombre}, folio {folio}' }).text, /^Hola Carlos, folio JC-0005$/);
  assert.match(buildShareMessage(quotation(), { ...business, mensajeClientes: '   ' }).text, /^Hola Carlos, te comparto/);
});

test('"valid until" is the local day in America/Mazatlan, also near midnight UTC', () => {
  assert.equal(new Date().getTimezoneOffset(), 420);
  // 2026-11-13T03:30Z is still Nov 12 20:30 in Culiacán: +15 days is Nov 27 (a UTC calendar would say 28).
  const late = buildShareMessage(quotation({ createdAt: '2026-11-13T03:30:00.000Z' }), business).text;
  assert.match(late, /Vigente hasta: 27 de noviembre de 2026/);
  // 2026-11-12T06:59Z is Nov 11 23:59 local.
  const early = buildShareMessage(quotation({ createdAt: '2026-11-12T06:59:00.000Z', validityDays: 1 }), business).text;
  assert.match(early, /Vigente hasta: 12 de noviembre de 2026/);
});

test('preview uses the example data and every variable has an example', () => {
  const preview = previewMessage(DEFAULT_MESSAGE_TEMPLATE);
  assert.doesNotMatch(preview, /\{[a-z_]+\}/);
  assert.match(preview, /Hola María, te comparto la cotización JC-0005/);
  assert.equal(MESSAGE_VARIABLES.length, 7);
  for (const variable of MESSAGE_VARIABLES) assert.ok(variable.example && variable.description);
});
