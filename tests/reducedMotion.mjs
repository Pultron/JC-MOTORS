import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { connect } from './cdpClient.mjs';

// #036: con prefers-reduced-motion: reduce nada se anima y los toasts desaparecen igual (temporizador de JS).
// Requiere `npm run dev` (APP_URL) y un navegador con perfil AISLADO y --remote-debugging-port=CDP_PORT.
const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const ROUTES = ['/', '/nueva-cotizacion', '/historial', '/clientes', '/facturas', '/control-interno', '/respaldo', '/datos-del-taller'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const c = await connect(Number(process.env.CDP_PORT ?? 9223));

const OFFENDERS = `(() => {
  const toMs = (v) => v.split(',').map((x) => x.trim()).map((x) => (x.endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000));
  const bad = [];
  for (const el of document.querySelectorAll('*')) {
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      if (cs.animationName === 'none') continue;
      const worst = Math.max(...toMs(cs.animationDuration));
      if (worst > 0.01) bad.push((el.className?.toString?.() || el.tagName) + (pseudo || '') + ' ' + cs.animationName + ' ' + cs.animationDuration);
    }
  }
  return bad;
})()`;

try {
  await c.send('Page.enable');
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const route of ROUTES) {
    await c.send('Page.navigate', { url: `${BASE}/?m=${Date.now()}#${route}` });
    await sleep(1200);
    assert.deepEqual(await c.evaluate(OFFENDERS), [], `Animaciones activas en ${route}`);
  }

  // El toast aparece y desaparece solo (~5 s) aunque no haya animación.
  await c.send('Page.navigate', { url: `${BASE}/?m=${Date.now()}#/facturas` });
  await sleep(1200);
  const bogus = 'C:/Users/Hecto/AppData/Local/Temp/claude/a817fabe477b76fe/e79ba7d4-3346-4f9c-b71a-ec944e8090d2/scratchpad/no-es-factura.xml';
  await writeFile(bogus, 'esto no es un CFDI');
  const { root } = await c.send('DOM.getDocument');
  const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-testid=xml-input]' });
  await c.send('DOM.setFileInputFiles', { nodeId, files: [bogus] });
  await c.waitFor('document.querySelectorAll("[data-testid=toast]").length > 0');
  assert.deepEqual(await c.evaluate(OFFENDERS), [], 'Animaciones activas con el toast abierto');
  await sleep(3000);
  assert.equal(await c.evaluate('document.querySelectorAll("[data-testid=toast]").length'), 1, 'El toast no debe cerrarse antes de tiempo');
  const t0 = Date.now();
  await c.waitFor('document.querySelectorAll("[data-testid=toast]").length === 0');
  console.log(`OK: el toast desapareció solo a los ~${3000 + Date.now() - t0} ms; sin animaciones activas en ${ROUTES.length} rutas`);
} finally {
  c.close();
}
