import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createId } from '../src/utils/quotation.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const N = 100_000;

test('crypto.randomUUID path: 100k ids, no collisions, v4 format', () => {
  const ids = new Set();
  for (let i = 0; i < N; i++) { const id = createId(globalThis.crypto); assert.match(id, UUID_V4); ids.add(id); }
  assert.equal(ids.size, N);
});

test('getRandomValues fallback (no randomUUID): 100k ids, no collisions, same format', () => {
  const noUuid = { getRandomValues: (array) => globalThis.crypto.getRandomValues(array) };
  const ids = new Set();
  for (let i = 0; i < N; i++) { const id = createId(noUuid); assert.match(id, UUID_V4); ids.add(id); }
  assert.equal(ids.size, N);
});

test('without any crypto it fails loudly instead of using Math.random', () => {
  assert.throws(() => createId({}), /aleatorios/);
});
