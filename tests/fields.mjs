import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_YEAR, MIN_YEAR, PHONE_REQUIRED, PLATES_MIN_LENGTH, formatPhone, normalizeEmail, normalizePhone, normalizePlates,
  parseDecimalStrict, phoneForStorage, sanitizeSingleLine, stripLineBreaks, validateEmail, validatePhone, validatePlates,
  validateQuantity, validateYear,
} from '../src/validation/fields.ts';

test('constants', () => {
  assert.equal(MIN_YEAR, 1980);
  assert.equal(MAX_YEAR, new Date().getFullYear() + 1);
  assert.equal(PHONE_REQUIRED, false);
  assert.equal(PLATES_MIN_LENGTH, 3);
});

test('sanitizeSingleLine: newlines/tabs to space, collapse, trim', () => {
  assert.equal(sanitizeSingleLine('  Juan \t  Pérez\r\n Gómez  '), 'Juan Pérez Gómez');
  assert.equal(stripLineBreaks('a\tb\nc'), 'a b c');
  assert.equal(stripLineBreaks('a  b '), 'a  b ');
});

test('#005 normalizePhone strips 52 / 521 only when the rest is 10 digits', () => {
  assert.equal(normalizePhone('+52 (667) 351-8806'), '6673518806');
  assert.equal(normalizePhone('52 667 351 8806'), '6673518806');
  assert.equal(normalizePhone('521 667 351 8806'), '6673518806');
  assert.equal(normalizePhone('667 351 8806'), '6673518806');
  assert.equal(normalizePhone('52 667 351 880'), '52667351880');
  assert.equal(phoneForStorage('+52 (667) 351-8806'), '6673518806');
  assert.equal(phoneForStorage(' 123456789012345 '), '123456789012345', 'legacy values are kept');
  assert.equal(formatPhone('6673518806'), '(667) 351-8806');
  assert.equal(formatPhone('123456789012345'), '123456789012345');
});

test('#005 validatePhone messages state the count', () => {
  assert.equal(validatePhone('').ok, true);
  assert.equal(validatePhone('', true).ok, false);
  assert.equal(validatePhone('(667) 351-8806').ok, true);
  assert.equal(validatePhone('+52 667 351 8806').ok, true);
  assert.equal(validatePhone('6673518').mensaje, 'Faltan 3 dígitos (lleva 7 de 10).');
  assert.equal(validatePhone('667351880').mensaje, 'Faltan 1 dígito (lleva 9 de 10).');
  assert.equal(validatePhone('123456789012345').mensaje, 'Sobran 5 dígitos (lleva 15 de 10).');
  assert.equal(validatePhone('abc').ok, false);
});

test('email', () => {
  assert.equal(normalizeEmail('  Foo@Bar.COM '), 'foo@bar.com');
  assert.equal(validateEmail('').ok, true);
  assert.equal(validateEmail(' Foo@Bar.com ').ok, true);
  for (const bad of ['foo', 'foo@bar', 'foo@@bar.com', 'fo o@bar.com', 'foo@bar..com']) assert.equal(validateEmail(bad).ok, false, bad);
});

test('#012 plates', () => {
  assert.equal(validatePlates('').ok, true);
  assert.equal(normalizePlates(' abc-123  a '), 'ABC-123 A');
  assert.equal(validatePlates('ab').ok, false);
  assert.equal(validatePlates('abc').ok, true);
  assert.equal(validatePlates('ABC-123-A').ok, true);
  assert.equal(validatePlates('ABC#123').ok, false);
});

test('#006 year range', () => {
  assert.equal(validateYear(MIN_YEAR).ok, true);
  assert.equal(validateYear(MAX_YEAR).ok, true);
  assert.equal(validateYear(MIN_YEAR - 1).ok, false);
  assert.equal(validateYear(MAX_YEAR + 1).ok, false);
  assert.equal(validateYear(2000.5).ok, false);
  assert.match(validateYear(1900).mensaje, /1980/);
});

test('#007 quantities', () => {
  assert.equal(validateQuantity(1, 'part').ok, true);
  assert.equal(validateQuantity(3, 'part').ok, true);
  assert.equal(validateQuantity(0, 'part').ok, false);
  assert.equal(validateQuantity(1.5, 'part').ok, false);
  assert.equal(validateQuantity(Number.NaN, 'part').ok, false);
  assert.equal(validateQuantity(1.5, 'labor').ok, true);
  assert.equal(validateQuantity(0.25, 'labor').ok, true);
  assert.equal(validateQuantity(1.255, 'labor').ok, false);
  assert.equal(validateQuantity(0, 'labor').ok, false);
});

test('#009/#013 parseDecimalStrict', () => {
  for (const [input, value] of [['1234.56', 1234.56], ['1,234.56', 1234.56], ['$1,234.56', 1234.56], [' $ 1 234.56 ', 1234.56], ['0', 0], ['.5', 0.5], ['10.00', 10]]) {
    const result = parseDecimalStrict(input);
    assert.equal(result.ok, true, input);
    assert.equal(result.valor, value, input);
  }
  assert.equal(parseDecimalStrict('$1,234.56').texto, '1234.56');
  assert.equal(parseDecimalStrict('-100').mensaje, 'No se permiten montos negativos.');
  assert.equal(parseDecimalStrict('$-100').ok, false);
  for (const bad of ['', 'abc', '1.2.3', '12,34', '1,23,456', '5.', '1e5', '$']) assert.equal(parseDecimalStrict(bad).ok, false, bad);
});

test('#005 phone paste and input helpers', async () => {
  const { phoneFromPaste, sanitizePhoneInput } = await import('../src/validation/fields.ts');
  assert.equal(phoneFromPaste('+52 (667) 351-8806'), '(667) 351-8806');
  assert.equal(phoneFromPaste('52 667 351 8806'), '(667) 351-8806');
  assert.equal(phoneFromPaste('521 667 351 8806'), '(667) 351-8806');
  assert.equal(phoneFromPaste('6673518'), '6673518');
  assert.equal(phoneFromPaste('+1 (555) 123-4567 ext 99'), '1555123456');
  assert.equal(sanitizePhoneInput('123456789000000'), '1234567890');
  assert.equal(sanitizePhoneInput('(667) 351-88069'), '(667) 351-8806');
  assert.equal(sanitizePhoneInput('66a7-3b'), '667-3');
});
