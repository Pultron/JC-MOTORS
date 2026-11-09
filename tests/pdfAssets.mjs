import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOGO_MISSING_TITLE, createLogoLoader, createPdfAssetsLoader, warnIfLogoMissing } from '../src/utils/pdfAssetsCore.ts';

const fonts = { regular: 'r', bold: 'b', extraBold: 'x' };

test('#021 si el logo no carga: console.error con el motivo, sin lanzar, y los assets salen sin logo', async () => {
  const logged = [];
  const loadLogo = createLogoLoader(async () => { throw new Error('HTTP 404'); }, (message) => logged.push(message));
  const assets = await createPdfAssetsLoader(async () => fonts, loadLogo)();
  assert.equal(assets.logo, undefined);
  assert.equal(assets.logoError, 'HTTP 404');
  assert.equal(logged.length, 1);
  assert.match(logged[0], /HTTP 404/);
  assert.deepEqual({ regular: assets.regular, bold: assets.bold, extraBold: assets.extraBold }, fonts);
});

test('#021 el aviso al usuario sale solo cuando falta el logo', () => {
  const titles = [];
  const toast = { warning: ({ title }) => titles.push(title) };
  warnIfLogoMissing({ logoError: 'x' }, toast);
  warnIfLogoMissing({}, toast);
  assert.deepEqual(titles, [LOGO_MISSING_TITLE]);
  assert.equal(LOGO_MISSING_TITLE, 'No se pudo cargar el logo; el PDF se generó sin él');
});

test('#021 un fallo del logo no se queda en caché: el siguiente PDF lo intenta de nuevo', async () => {
  let attempts = 0;
  const loadLogo = createLogoLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporal');
    return 'data:image/png;base64,AAA';
  }, () => {});
  assert.equal((await loadLogo()).error, 'temporal');
  assert.equal((await loadLogo()).logo, 'data:image/png;base64,AAA');
  assert.equal((await loadLogo()).logo, 'data:image/png;base64,AAA');
  assert.equal(attempts, 2);
});
