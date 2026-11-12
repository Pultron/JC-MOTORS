import { mkdir } from 'node:fs/promises';
import { connect } from './cdpClient.mjs';

// Captura cada ruta y reporta el ancho del <main> para comparar antes/después (#032).
// Requiere `npm run dev` (APP_URL) y un navegador con perfil AISLADO y --remote-debugging-port=CDP_PORT.
//   LABEL=antes node tests/rutasCapturas.mjs
const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const LABEL = process.env.LABEL ?? 'captura';
const dir = `tests/artifacts/rutas/${LABEL}`;
await mkdir(dir, { recursive: true });
const ROUTES = ['/', '/nueva-cotizacion', '/historial', '/clientes', '/facturas', '/control-interno', '/respaldo', '/datos-del-taller', '/atajos'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const c = await connect(Number(process.env.CDP_PORT ?? 9223));
const report = {};
try {
  await c.send('Page.enable');
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const route of ROUTES) {
    await c.send('Page.navigate', { url: `${BASE}/?r=${Date.now()}#${route}` });
    await sleep(1400);
    report[route] = await c.evaluate('(() => { const m = document.querySelector("main"); const r = m.getBoundingClientRect(); return { cls: m.className, width: Math.round(r.width), left: Math.round(r.left) }; })()');
    await c.screenshot(`${dir}/${route === '/' ? 'inicio' : route.slice(1)}.png`);
  }
  console.log(JSON.stringify(report, null, 1));
} finally {
  c.close();
}
