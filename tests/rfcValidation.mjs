import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rfcInvalido, rfcValido } from '../src/services/invoiceValidation.ts';

test('#031 persona moral (12) y persona física (13) válidas', () => {
  assert.equal(rfcValido('MME141128EY7'), true); // moral, receptor de la factura de ejemplo pac-sat-dos-columnas.pdf
  assert.equal(rfcValido('LAVJ030214Q21'), true); // física, emisor de la factura de ejemplo
  assert.equal(rfcValido('SAT970701NN3'), true); // PAC de las facturas de ejemplo
  assert.equal(rfcValido('LIDV970203UB4'), true);
  assert.equal(rfcValido('mme141128ey7'), true, 'sin distinguir mayúsculas');
  assert.equal(rfcValido(' MME141128EY7 '), true, 'ignora espacios en los extremos');
  assert.equal(rfcValido('AAA010101AAA'), true);
  assert.equal(rfcValido('Ñ&A010101AB1'), true, 'Ñ y & son letras válidas');
});

test('#031 RFC genéricos', () => {
  assert.equal(rfcValido('XAXX010101000'), true);
  assert.equal(rfcValido('XEXX010101000'), true);
});

test('#031 RFC inválidos', () => {
  assert.equal(rfcValido(''), false);
  assert.equal(rfcValido('ABC'), false);
  assert.equal(rfcValido('MME141128EY'), false, '11 caracteres');
  assert.equal(rfcValido('LAVJ030214Q211'), false, '14 caracteres');
  assert.equal(rfcValido('MME14112_EY7'), false, 'símbolo en la fecha');
  assert.equal(rfcValido('1ME141128EY7'), false, 'dígito entre las letras iniciales');
  assert.equal(rfcValido('MME141328EY7'), false, 'mes 13');
  assert.equal(rfcValido('MME140028EY7'), false, 'mes 00');
  assert.equal(rfcValido('MME141132EY7'), false, 'día 32');
  assert.equal(rfcValido('MME141100EY7'), false, 'día 00');
  assert.equal(rfcValido('MME140431EY7'), false, '31 de abril');
});

test('#031 29 de febrero: solo si el año de dos dígitos es múltiplo de 4', () => {
  assert.equal(rfcValido('MME240229EY7'), true);
  assert.equal(rfcValido('MME000229EY7'), true, '00 puede ser 2000');
  assert.equal(rfcValido('MME230229EY7'), false);
  assert.equal(rfcValido('MME240230EY7'), false);
  assert.equal(rfcValido('MME230228EY7'), true);
});

test('#031 rfcInvalido marca la factura si falla el emisor o el receptor', () => {
  const ok = { emisor: { rfc: 'LAVJ030214Q21' }, receptor: { rfc: 'XAXX010101000' } };
  assert.equal(rfcInvalido(ok), false);
  assert.equal(rfcInvalido({ ...ok, receptor: { rfc: 'XAXX010101' } }), true);
  assert.equal(rfcInvalido({ ...ok, emisor: { rfc: '' } }), true);
});
