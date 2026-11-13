import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_BUSINESS_INFO } from '../src/config/businessInfo.ts';
import { DEFAULT_INVOICE_MESSAGE_TEMPLATE, DEFAULT_MESSAGE_TEMPLATE } from '../src/services/shareMessage.ts';
import { applyDatos, applyMensaje, buildSaveCandidate, changedSections, insertAtCursor, isDirty, saveToastCopy, shouldBlockNavigation, joinAddress, splitAddress, toFormValues, validateWorkshopForm } from '../src/services/workshopForm.ts';

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

test('insertAtCursor inserts at the caret, replaces a selection and clamps bad offsets', () => {
  assert.deepEqual(insertAtCursor('Hola ', 5, 5, '{nombre}'), { text: 'Hola {nombre}', caret: 13 });
  assert.deepEqual(insertAtCursor('Hola mundo', 5, 10, '{nombre}'), { text: 'Hola {nombre}', caret: 13 });
  assert.deepEqual(insertAtCursor('ac', 1, 1, 'b'), { text: 'abc', caret: 2 });
  assert.deepEqual(insertAtCursor('abc', 2, 0, 'X'), { text: 'Xc', caret: 1 });
  assert.deepEqual(insertAtCursor('abc', 99, 99, 'X'), { text: 'abcX', caret: 4 });
  assert.deepEqual(insertAtCursor('', 0, 0, '{a}'), { text: '{a}', caret: 3 });
});

test('changedSections tells which part differs and ignores revert-to-original', () => {
  const saved = toFormValues(DEFAULT_BUSINESS_INFO);
  assert.equal(changedSections(saved, { ...saved }), 'ninguno');
  assert.equal(changedSections(saved, { ...saved, nombre: 'Otro' }), 'datos');
  assert.equal(changedSections(saved, { ...saved, mensaje: 'hola' }), 'mensaje');
  assert.equal(changedSections(saved, { ...saved, correo: 'a@b.mx', mensaje: 'hola' }), 'ambos');
});

test('saveToastCopy: message-only gets its own title, everything else the generic one', () => {
  assert.equal(saveToastCopy('mensaje').title, 'Mensaje para cotizaciones guardado');
  assert.equal(saveToastCopy('mensajeFacturas').title, 'Mensaje para facturas guardado');
  assert.equal(saveToastCopy('mensajes').title, 'Mensajes guardados');
  assert.equal(saveToastCopy('datos').title, 'Datos guardados');
  assert.equal(saveToastCopy('ambos').title, 'Datos guardados');
  assert.equal(saveToastCopy('datos').description, 'Los cambios del taller ya están activos en tus cotizaciones.');
});

test('applyMensaje stores the default or blank text as "no custom message"; buildSaveCandidate saves both parts', () => {
  const base = { ...DEFAULT_BUSINESS_INFO, mensajeClientes: 'viejo' };
  const values = toFormValues(base);
  assert.equal('mensajeClientes' in applyMensaje({ ...values, mensaje: DEFAULT_MESSAGE_TEMPLATE }, base), false);
  assert.equal('mensajeClientes' in applyMensaje({ ...values, mensaje: '   ' }, base), false);
  assert.equal(applyMensaje({ ...values, mensaje: 'nuevo' }, base).mensajeClientes, 'nuevo');
  const both = buildSaveCandidate({ ...values, nombre: 'Taller X', mensaje: 'nuevo' }, base);
  assert.equal(both.nombre, 'Taller X');
  assert.equal(both.mensajeClientes, 'nuevo');
});

test('shouldBlockNavigation only blocks a dirty form that moves to another location', () => {
  const here = { pathname: '/taller', search: '' };
  assert.equal(shouldBlockNavigation(false, here, { pathname: '/historial' }), false);
  assert.equal(shouldBlockNavigation(true, here, { pathname: '/historial' }), true);
  assert.equal(shouldBlockNavigation(true, here, { pathname: '/taller', search: '' }), false);
  assert.equal(shouldBlockNavigation(true, here, { pathname: '/taller', search: '?x=1' }), true);
});

test('invoice message: defaults to the invoice template, dirty tracking, sections and independent storage', () => {
  const saved = toFormValues(DEFAULT_BUSINESS_INFO);
  assert.equal(saved.mensajeFacturas, DEFAULT_INVOICE_MESSAGE_TEMPLATE);
  assert.equal(isDirty(saved, { ...saved, mensajeFacturas: '' }), false, 'blank means default');
  assert.equal(isDirty(saved, { ...saved, mensajeFacturas: `${DEFAULT_INVOICE_MESSAGE_TEMPLATE}\n` }), false);
  assert.equal(isDirty(saved, { ...saved, mensajeFacturas: 'otro' }), true);
  // The quotation default must not be confused with the invoice default.
  assert.equal(isDirty(saved, { ...saved, mensajeFacturas: DEFAULT_MESSAGE_TEMPLATE }), true);
  assert.equal(changedSections(saved, { ...saved, mensajeFacturas: 'hola' }), 'mensajeFacturas');
  assert.equal(changedSections(saved, { ...saved, mensaje: 'a', mensajeFacturas: 'b' }), 'mensajes');
  assert.equal(changedSections(saved, { ...saved, nombre: 'Otro', mensajeFacturas: 'b' }), 'ambos');
  assert.equal(changedSections(saved, { ...saved, nombre: 'Otro' }), 'datos');

  const base = { ...DEFAULT_BUSINESS_INFO, mensajeClientes: 'cot', mensajeFacturas: 'fac' };
  const values = toFormValues(base);
  assert.equal(values.mensaje, 'cot');
  assert.equal(values.mensajeFacturas, 'fac');
  const reset = applyMensaje({ ...values, mensajeFacturas: DEFAULT_INVOICE_MESSAGE_TEMPLATE }, base);
  assert.equal('mensajeFacturas' in reset, false);
  assert.equal(reset.mensajeClientes, 'cot', 'the other message is untouched');
  assert.equal('mensajeFacturas' in applyMensaje({ ...values, mensajeFacturas: '  ' }, base), false);
  assert.equal(applyMensaje({ ...values, mensaje: DEFAULT_MESSAGE_TEMPLATE }, base).mensajeFacturas, 'fac');
  const both = buildSaveCandidate({ ...values, nombre: 'Taller X', mensajeFacturas: 'nueva' }, base);
  assert.equal(both.nombre, 'Taller X');
  assert.equal(both.mensajeFacturas, 'nueva');
  assert.equal(both.mensajeClientes, 'cot');
});
