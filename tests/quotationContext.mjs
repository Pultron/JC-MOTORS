import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../src/store/QuotationContext.tsx', import.meta.url)), 'utf8');

test('#048 QuotationContext ya no sondea localStorage con un temporizador', () => {
  assert.doesNotMatch(source, /setInterval|clearInterval/);
});

test('#048 se sincroniza con el evento storage (segunda ventana) y al volver a la ventana', () => {
  assert.match(source, /addEventListener\('storage'/);
  assert.match(source, /removeEventListener\('storage'/);
  assert.match(source, /event\.key === STORAGE_KEYS\.quotations/);
  assert.match(source, /addEventListener\('focus'/);
  assert.match(source, /visibilitychange/);
});

test('#048 cada mutación del contexto vuelve a leer la lista tras escribir', () => {
  for (const operation of ['create', 'update', 'approve', 'cancel', 'deletePermanently']) {
    const body = source.slice(source.indexOf(`quotationService.${operation}(`));
    assert.match(body.slice(0, 400), /setQuotations\(await quotationService\.list\(\)\)/, operation);
  }
});

test('permanent deletion is allowed only for cancelled and expired quotations', async () => {
  const { isDeletableStatus } = await import('../src/models/quotation.ts');
  assert.equal(isDeletableStatus('Cancelada'), true);
  assert.equal(isDeletableStatus('Vencida'), true);
  assert.equal(isDeletableStatus('Pendiente'), false);
  assert.equal(isDeletableStatus('Aprobada'), false);
});
