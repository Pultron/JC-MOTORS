import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOGO_MISSING_TITLE, createLogoLoader, createPdfAssetsLoader, scheduleWhenIdle, warnIfLogoMissing } from '../src/utils/pdfAssetsCore.ts';

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

test('#035 abrir y cerrar el diálogo 5 veces no vuelve a cargar ni decodificar fuentes ni logo', async () => {
  let fontFetches = 0;
  let logoDecodes = 0;
  const loadPdfAssets = createPdfAssetsLoader(
    async () => { fontFetches += 1; return fonts; },
    createLogoLoader(async () => { logoDecodes += 1; return 'data:image/png;base64,AAA'; }),
  );
  for (let open = 0; open < 5; open += 1) {
    const assets = await loadPdfAssets();
    assert.equal(assets.logo, 'data:image/png;base64,AAA');
  }
  assert.equal(fontFetches, 1);
  assert.equal(logoDecodes, 1);
});

test('#035 aperturas simultáneas comparten la misma carga', async () => {
  let fontFetches = 0;
  const loadPdfAssets = createPdfAssetsLoader(async () => { fontFetches += 1; return fonts; }, async () => ({ logo: 'l' }));
  await Promise.all([loadPdfAssets(), loadPdfAssets(), loadPdfAssets()]);
  assert.equal(fontFetches, 1);
});

test('#035 si las fuentes fallan no se guarda el fallo para siempre', async () => {
  let fontFetches = 0;
  const loadPdfAssets = createPdfAssetsLoader(async () => {
    fontFetches += 1;
    if (fontFetches === 1) throw new Error('sin red');
    return fonts;
  }, async () => ({ logo: 'l' }));
  await assert.rejects(loadPdfAssets(), /sin red/);
  assert.equal((await loadPdfAssets()).regular, 'r');
  await loadPdfAssets();
  assert.equal(fontFetches, 2);
});

test('#035 el precargado usa requestIdleCallback y, si no existe, un setTimeout', () => {
  const calls = [];
  scheduleWhenIdle(() => {}, { requestIdleCallback: (_cb, options) => calls.push(['idle', options.timeout]), setTimeout: () => calls.push(['timeout']) });
  scheduleWhenIdle(() => {}, { setTimeout: (_cb, ms) => calls.push(['timeout', ms]) });
  assert.deepEqual(calls, [['idle', 5000], ['timeout', 1500]]);
});
