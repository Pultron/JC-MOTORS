import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { connect } from './cdpClient.mjs';

// #038: recorre con Tab las pantallas principales en tema claro y oscuro y verifica el anillo de foco doble.
// Requiere `npm run dev` y un navegador con perfil AISLADO y --remote-debugging-port=CDP_PORT.
const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const dir = 'tests/artifacts/foco';
await mkdir(dir, { recursive: true });
const THEME_KEY = 'jc-motors:sidebar-theme:v1';
const ROUTES = [['nueva-cotizacion', '/nueva-cotizacion'], ['historial', '/historial'], ['clientes', '/clientes'], ['facturas', '/facturas']];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const c = await connect(Number(process.env.CDP_PORT ?? 9223));
const tab = async () => { await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await sleep(120); };
const RING = `(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { tag: e.tagName, cls: String(e.className).slice(0, 40), outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, offset: cs.outlineOffset, shadow: cs.boxShadow }; })()`;

try {
  await c.send('Page.enable');
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const theme of ['dark', 'light']) {
    await c.send('Page.navigate', { url: `${BASE}/#/` });
    await sleep(600);
    await c.evaluate(`localStorage.setItem(${JSON.stringify(THEME_KEY)}, ${JSON.stringify(theme)})`);
    for (const [name, route] of ROUTES) {
      await c.send('Page.navigate', { url: `${BASE}/?f=${Date.now()}#${route}` });
      await sleep(1300);
      await c.evaluate('document.activeElement.blur(); window.scrollTo(0, 0)');
      const seen = [];
      for (let i = 1; i <= 9; i++) {
        await tab();
        const ring = await c.evaluate(RING);
        seen.push(ring);
        if (ring.tag !== 'BODY') {
          assert.match(ring.outline, /solid 2px/, `${name}/${theme} tab ${i}: ${JSON.stringify(ring)}`);
          assert.equal(ring.offset, '2px', `${name}/${theme} tab ${i}`);
          assert.match(ring.shadow, /0px 0px 0px 2px/, `${name}/${theme} tab ${i}: sin anillo de separación ${JSON.stringify(ring)}`);
        }
        if (i === 2 || i === 8) await c.screenshot(`${dir}/${name}-${theme}-tab${i}.png`);
      }
    }
  }
  console.log('OK: foco visible con anillo doble en 4 pantallas x 2 temas');
} finally {
  await c.evaluate(`localStorage.removeItem(${JSON.stringify(THEME_KEY)})`).catch(() => undefined);
  c.close();
}
