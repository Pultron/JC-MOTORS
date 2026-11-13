import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizePlatesInput, validatePhone } from '../src/validation/fields.ts';
import { caretAfterDigits, editPhone, formatPhoneDigits, titleCaseName } from '../src/validation/liveFormat.ts';

/** Types one character at the caret, like the browser would, and returns the next field state. */
function type(state, char) {
  const raw = state.value.slice(0, state.caret) + char + state.value.slice(state.caret);
  return editPhone(state.value, raw, state.caret + 1, 'other');
}

test('phone: typing digit by digit builds (667) 351-8806 with the caret in place', () => {
  let state = { value: '', caret: 0 };
  const seen = [];
  for (const digit of '6673518806') {
    state = type(state, digit);
    seen.push(state.value);
    assert.equal(state.caret, state.value.length, `caret at the end after ${state.value}`);
  }
  assert.deepEqual(seen, ['(6', '(66', '(667', '(667) 3', '(667) 35', '(667) 351', '(667) 351-8', '(667) 351-88', '(667) 351-880', '(667) 351-8806']);
});

test('phone: an 11th digit and letters are ignored', () => {
  const full = { value: '(667) 351-8806', caret: 14 };
  assert.equal(type(full, '9').value, '(667) 351-8806');
  assert.equal(type(full, 'a').value, '(667) 351-8806');
  assert.equal(type(full, 'a').caret, 14);
});

test('phone: typing in the middle keeps the caret after the new digit', () => {
  const edit = type({ value: '(667) 351-8806', caret: 3 }, '9'); // "(66|7" -> "(669|"
  assert.equal(edit.value, '(669) 735-1880', 'the 11th digit falls off the end');
  assert.equal(edit.caret, 4);
});

test('phone: pasting +52 667 351 8806 and 521 variants gives (667) 351-8806', () => {
  assert.equal(editPhone('', '+52 667 351 8806', 16).value, '(667) 351-8806');
  assert.equal(editPhone('', '+52 667 351 8806', 16).caret, 14);
  assert.equal(editPhone('', '521 667 351 8806', 16).value, '(667) 351-8806');
  assert.equal(editPhone('', '667-351-8806', 12).value, '(667) 351-8806');
});

test('phone: Backspace over ")" or "-" deletes the previous digit', () => {
  // "(667) |351" -> Backspace removes the space; the digit "7" must go instead.
  const overSpace = editPhone('(667) 351', '(667)351', 5, 'backward');
  assert.equal(overSpace.value, '(663) 51');
  assert.equal(overSpace.caret, 3);
  // "(667) 351-|8806" -> Backspace removes "-"; the digit "1" must go.
  const overDash = editPhone('(667) 351-8806', '(667) 3518806', 9, 'backward');
  assert.equal(overDash.value, '(667) 358-806');
  assert.equal(overDash.caret, 8);
  // Backspace over a digit behaves normally.
  const overDigit = editPhone('(667) 351', '(667) 35', 8, 'backward');
  assert.equal(overDigit.value, '(667) 35');
  // Back to empty.
  assert.equal(editPhone('(6', '(', 1, 'backward').value, '');
});

test('phone: Delete forward over a symbol removes the next digit', () => {
  const edit = editPhone('(667) 351', '(667)351', 5, 'forward');
  assert.equal(edit.value, '(667) 51');
});

test('phone: formatting helpers', () => {
  assert.equal(formatPhoneDigits(''), '');
  assert.equal(formatPhoneDigits('66'), '(66');
  assert.equal(caretAfterDigits('(667) 351', 3), 4);
  assert.equal(caretAfterDigits('(667) 351', 0), 0);
});

test('phone: "Faltan N dígitos" comes from validatePhone, so the caller shows it only after blur', () => {
  assert.equal(validatePhone('(667) 351').mensaje, 'Faltan 4 dígitos (lleva 6 de 10).');
  assert.equal(validatePhone('(667) 351-8806').ok, true);
});

test('plates: uppercase while typing', () => {
  assert.equal(sanitizePlatesInput('abc-123-a'), 'ABC-123-A');
});

test('name: title case with lowercase particles and no invented accents', () => {
  assert.equal(titleCaseName('maria de la luz'), 'Maria de la Luz');
  assert.equal(titleCaseName('maría de la luz'), 'María de la Luz');
  assert.equal(titleCaseName('JOSE'), 'Jose');
  assert.equal(titleCaseName('  juan   DEL  valle '), 'Juan del Valle');
  assert.equal(titleCaseName('de la cruz'), 'De la Cruz', 'a particle opening the name is capitalized');
  assert.equal(titleCaseName('ana-maría o’brien'), 'Ana-María O’Brien');
});
