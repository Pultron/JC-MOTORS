import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { DEFAULT_BUSINESS_INFO } from '../src/config/businessInfo.ts';
import { peekNextFolio } from '../src/services/folioService.ts';
import { buildFreshInfo, ensureCountersAtZero, folioAfter, freshInitialValues, validateFreshForm } from '../src/services/welcomeFresh.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';

const { data } = installMemoryStorage();
beforeEach(() => data.clear());

const base = { ...DEFAULT_BUSINESS_INFO, telefonos: [...DEFAULT_BUSINESS_INFO.telefonos] };
const valid = { nombre: 'Taller Pérez', telefono: '(667) 123-4567', calle: 'Av. Reforma 10', colonia: 'Col. Centro, Culiacán', correo: 'perez@gmail.com' };

test('initial values come from the saved workshop data or the defaults', () => {
  const values = freshInitialValues(base);
  assert.deepEqual(values, { nombre: 'JC MOTORS', telefono: '(667) 351-8806', calle: 'Av. Río Ometepec #1136,', colonia: 'Col. Morelos, Culiacán, Sin.', correo: 'JCMOTORSCLN@gmail.com' });
  assert.deepEqual(Object.keys(values), ['nombre', 'telefono', 'calle', 'colonia', 'correo']);
});

test('valid form: no errors; email is optional', () => {
  assert.deepEqual(validateFreshForm(valid, base), {});
  assert.deepEqual(validateFreshForm({ ...valid, correo: '' }, base), {});
});

test('required rows and formats are reported per row', () => {
  const errors = validateFreshForm({ nombre: ' ', telefono: '123', calle: '', colonia: '', correo: 'sin-arroba' }, base);
  assert.deepEqual(Object.keys(errors).sort(), ['calle', 'colonia', 'correo', 'nombre', 'telefono']);
  assert.match(errors.nombre, /nombre/i);
  assert.match(errors.telefono, /Faltan 7/);
  assert.match(errors.calle, /calle/i);
  assert.match(errors.colonia, /colonia/i);
  assert.equal(validateFreshForm({ ...valid, nombre: 'N'.repeat(29) }, base).nombre?.includes('28'), true);
  assert.ok(validateFreshForm({ ...valid, calle: 'x'.repeat(41) }, base).calle);
});

test('form maps to the stored BusinessInfo: formatted phone, two address lines, blank email dropped, other fields kept', () => {
  const info = buildFreshInfo({ ...valid, telefono: '6671234567', nombre: '  Taller Pérez ', correo: '  ' }, { ...base, rfc: 'ABC', telefonos: ['(667) 351-8806', '(667) 000-1111'] });
  assert.equal(info.nombre, 'Taller Pérez');
  assert.deepEqual(info.telefonos, ['(667) 123-4567', '(667) 000-1111']);
  assert.equal(info.direccion, 'Av. Reforma 10\nCol. Centro, Culiacán');
  assert.equal('correo' in info, false);
  assert.equal(info.rfc, 'ABC');
});

test('counters go back to zero only when there is no business data', () => {
  data.set(STORAGE_KEYS.quotationFolio, JSON.stringify({ lastNumber: 7 }));
  data.set(STORAGE_KEYS.invoiceFolio, '4');
  assert.equal(peekNextFolio(), 'JC-0008');
  assert.equal(ensureCountersAtZero(), true);
  assert.equal(data.has(STORAGE_KEYS.quotationFolio) || data.has(STORAGE_KEYS.invoiceFolio), false);
  assert.equal(peekNextFolio(), 'JC-0001');
  assert.equal(ensureCountersAtZero(), false, 'nothing left to clear');
});

test('counters are never lowered when quotations, customers or invoices exist', () => {
  data.set(STORAGE_KEYS.quotations, JSON.stringify([{ id: 'q' }]));
  data.set(STORAGE_KEYS.quotationFolio, JSON.stringify({ lastNumber: 7 }));
  assert.equal(ensureCountersAtZero(), false);
  assert.equal(peekNextFolio(), 'JC-0008');
});

test('folioAfter builds the next folio from the last issued number', () => {
  assert.equal(folioAfter(0), 'JC-0001');
  assert.equal(folioAfter(41), 'JC-0042');
  assert.equal(folioAfter(9999), 'JC-10000');
  assert.equal(folioAfter(-3), 'JC-0001');
  assert.equal(folioAfter(Number.NaN), 'JC-0001');
});
