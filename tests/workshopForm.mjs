import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_BUSINESS_INFO } from '../src/config/businessInfo.ts';
import { DEFAULT_MESSAGE_TEMPLATE } from '../src/services/shareMessage.ts';
import { applyDatos, isDirty, joinAddress, splitAddress, toFormValues, validateWorkshopForm } from '../src/services/workshopForm.ts';

test('splitAddress: two lines, old single line, extra lines and CRLF', () => {
  assert.deepEqual(splitAddress('Av. Río #1\nCol. Morelos'), { calle: 'Av. Río #1', colonia: 'Col. Morelos' });
  assert.deepEqual(splitAddress('Av. Río #1, Col. Morelos'), { calle: 'Av. Río #1, Col. Morelos', colonia: '' });
  assert.deepEqual(splitAddress('  A  \r\n  B  \r\nC'), { calle: 'A', colonia: 'B C' });
  assert.deepEqual(splitAddress('\n\nA\n\nB'), { calle: 'A', colonia: 'B' });
  assert.deepEqual(splitAddress(''), { calle: '', colonia: '' });
});

test('joinAddress trims and drops blank rows; round-trips the default address', () => {
  assert.equal(joinAddress(' A ', ' B '), 'A\nB');
  assert.equal(joinAddress('A', ''), 'A');
  assert.equal(joinAddress('', 'B'), 'B');
  const { calle, colonia } = splitAddress(DEFAULT_BUSINESS_INFO.direccion);
  assert.equal(joinAddress(calle, colonia), DEFAULT_BUSINESS_INFO.direccion);
});

test('validateWorkshopForm maps errors to their own row', () => {
  const ok = toFormValues(DEFAULT_BUSINESS_INFO);
  assert.deepEqual(validateWorkshopForm(ok), {});
  const errors = validateWorkshopForm({ ...ok, nombre: ' ', telefono: '123', calle: '', colonia: 'x'.repeat(41), correo: 'mal' });
  assert.deepEqual(Object.keys(errors).sort(), ['calle', 'colonia', 'correo', 'nombre', 'telefono']);
  assert.ok(validateWorkshopForm({ ...ok, calle: 'x'.repeat(41) }).calle);
  assert.equal(validateWorkshopForm({ ...ok, calle: 'x'.repeat(40) }).calle, undefined);
  assert.equal(validateWorkshopForm({ ...ok, correo: '' }).correo, undefined);
  assert.ok(validateWorkshopForm({ ...ok, colonia: '' }).colonia, 'old one-line address needs the colony at save');
});

test('applyDatos stores the joined address and keeps extra phones and message', () => {
  const base = { ...DEFAULT_BUSINESS_INFO, telefonos: ['(667) 351-8806', '(667) 111-2222'], mensajeClientes: 'hola' };
  const values = { ...toFormValues(base), calle: 'Calle 1', colonia: 'Centro' };
  const info = applyDatos(values, base);
  assert.equal(info.direccion, 'Calle 1\nCentro');
  assert.deepEqual(info.telefonos, ['(667) 351-8806', '(667) 111-2222']);
  assert.equal(info.mensajeClientes, 'hola');
});

test('isDirty ignores whitespace, phone format and the default message', () => {
  const saved = toFormValues(DEFAULT_BUSINESS_INFO);
  assert.equal(saved.mensaje, DEFAULT_MESSAGE_TEMPLATE);
  assert.equal(isDirty(saved, { ...saved }), false);
  assert.equal(isDirty(saved, { ...saved, nombre: ` ${saved.nombre} `, telefono: '6673518806', mensaje: `${DEFAULT_MESSAGE_TEMPLATE}\n` }), false);
  assert.equal(isDirty(saved, { ...saved, mensaje: '' }), false);
  assert.equal(isDirty(saved, { ...saved, calle: 'Otra' }), true);
  assert.equal(isDirty(saved, { ...saved, correo: '' }), true);
  assert.equal(isDirty(saved, { ...saved, mensaje: 'otro' }), true);
  assert.equal(isDirty(saved, { ...saved, telefono: '(667) 351-8807' }), true);
});
