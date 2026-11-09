import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONCEPT_LIMIT_MESSAGE, conceptCounterLevel } from '../src/utils/conceptLimit.ts';

test('#033 el contador es neutro hasta 89, ámbar de 90 a 99 y rojo en 100', () => {
  assert.equal(conceptCounterLevel(0), 'ok');
  assert.equal(conceptCounterLevel(7), 'ok');
  assert.equal(conceptCounterLevel(89), 'ok');
  assert.equal(conceptCounterLevel(90), 'warning');
  assert.equal(conceptCounterLevel(99), 'warning');
  assert.equal(conceptCounterLevel(100), 'full');
});

test('#033 mensaje de límite', () => assert.equal(CONCEPT_LIMIT_MESSAGE, 'Límite de 100 conceptos alcanzado'));
