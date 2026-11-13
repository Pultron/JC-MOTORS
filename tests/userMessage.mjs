import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UserMessageError, userMessage } from '../src/utils/userMessage.ts';

test('technical errors become a generic Spanish message and the detail goes to console.error', () => {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const text = userMessage(new Error('TypeError: Cannot read properties of undefined (os error 5)'), 'pdf-generar');
    assert.equal(text, 'No se pudo generar el PDF. Intenta de nuevo.');
    assert.equal(userMessage('Acceso denegado. (os error 5)', 'pdf-guardar'), 'No se pudo guardar el PDF. Intenta de nuevo.');
    assert.equal(logged.length, 2);
    assert.equal(logged[0][0], '[pdf-generar]');
  } finally {
    console.error = original;
  }
});

test('messages already written for the user are kept untouched and not logged', () => {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    assert.equal(userMessage(new UserMessageError('El importe excede el límite permitido.'), 'gastos-guardar'), 'El importe excede el límite permitido.');
    class Typed extends Error {}
    assert.equal(userMessage(new Typed('Archivo no válido.'), 'gastos-guardar', (e) => e instanceof Typed), 'Archivo no válido.');
    assert.equal(logged.length, 0);
  } finally {
    console.error = original;
  }
});

test('taller-guardar context keeps the edits-stay-on-screen wording and logs the detail', () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.match(userMessage(new Error('QuotaExceededError'), 'taller-guardar'), /siguen en pantalla/);
  } finally {
    console.error = original;
  }
});
