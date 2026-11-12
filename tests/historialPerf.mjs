import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { connect } from './cdpClient.mjs';

// Rendimiento del Historial con 1000 cotizaciones. NUNCA usar con el perfil real del navegador:
// requiere un navegador con perfil aislado (--user-data-dir temporal) y --remote-debugging-port=CDP_PORT.
//   APP_URL=http://localhost:5173 CDP_PORT=9223 LABEL=despues node tests/historialPerf.mjs
const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const LABEL = process.env.LABEL ?? 'medicion';
const COUNT = Number(process.env.COUNT ?? 1000);
const dir = 'tests/artifacts/historial';
await mkdir(dir, { recursive: true });

const STORAGE_KEY = 'jc-motors:quotations:v1';
const FOLIO_KEY = 'jc-motors:quotation-folio:v1';
const makes = [['Toyota', 'Hilux'], ['Honda', 'Civic'], ['Nissan', 'Versa'], ['Ford', 'Ranger'], ['Chevrolet', 'Aveo'], ['Mazda', '3'], ['Volkswagen', 'Jetta']];
const names = ['María López', 'Juan Pérez', 'Ana Beltrán', 'Carlos Rivera', 'Sofía Zazueta', 'Luis Ortega', 'Diana Camacho', 'Pedro Quintero'];
const statuses = ['Pendiente', 'Aprobada', 'Cancelada', 'Vencida'];
const seed = Array.from({ length: COUNT }, (_, i) => {
  const n = i + 1;
  const [make, model] = makes[i % makes.length];
  const status = statuses[i % statuses.length];
  const createdAt = new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString();
  return {
    id: `perf-${n}`, folio: `JC-${String(n).padStart(4, '0')}`, createdAt,
    customer: { name: names[i % names.length], phone: `667${String(1000000 + ((i * 7919) % 8999999)).padStart(7, '0')}`, email: `cliente${n}@correo.com` },
    vehicle: { make, model, year: 2005 + (i % 20), plates: `PF${String(n).padStart(4, '0')}` },
    items: [
      { id: `a${n}`, type: 'labor', description: 'Afinación mayor', quantity: 1, saleUnitPrice: 800 + (i % 9) * 50, amount: 800 },
      { id: `b${n}`, type: 'part', description: `Filtro de aceite ${make}`, quantity: 2, saleUnitPrice: 150, amount: 300 },
      { id: `c${n}`, type: 'part', description: 'Balatas delanteras', quantity: 1, saleUnitPrice: 600, amount: 600 },
    ],
    laborDiscountType: 'fixed', laborDiscountValue: 0, includeVat: true,
    validityDays: 36500, publicNotes: '', customerNotes: '', status,
    ...(status === 'Aprobada' ? { approvedAt: createdAt } : {}),
  };
});

const c = await connect(Number(process.env.CDP_PORT ?? 9223));
try {
  await c.send('Page.enable');
  await c.send('Page.navigate', { url: `${BASE}/#/` });
  await c.waitFor('document.readyState === "complete"');
  // Guardia: el perfil debe estar vacío o ser de prueba. Si hay datos reales, no se toca nada.
  const existing = await c.evaluate(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`);
  assert.ok(existing === null || existing.includes('perf-') || existing === '[]', 'El perfil tiene datos reales: abortado sin modificar nada');
  await c.evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(seed))}); localStorage.setItem(${JSON.stringify(FOLIO_KEY)}, ${JSON.stringify(String(COUNT))});`);

  // Carga de la pantalla
  await c.send('Page.navigate', { url: `${BASE}/?perf=${Date.now()}#/historial` });
  const t0 = Date.now();
  await c.waitFor('document.querySelectorAll("[data-testid=hi-row]").length > 0');
  const loadMs = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 1200));
  const rowsRendered = await c.evaluate('document.querySelectorAll("[data-testid=hi-row]").length');

  // Escribir en la búsqueda: latencia de cada tecla (hasta el siguiente cuadro pintado) y tareas largas.
  const typing = await c.evaluate(`(async () => {
    const input = document.querySelector('[data-testid=hi-search]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const longTasks = [];
    const observer = new PerformanceObserver((list) => list.getEntries().forEach((e) => longTasks.push(e.duration)));
    try { observer.observe({ entryTypes: ['longtask'] }); } catch {}
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const text = 'toyota hilux';
    const keystroke = [];
    input.focus();
    let value = '';
    for (const ch of text) {
      value += ch;
      const start = performance.now();
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await frame();
      keystroke.push(performance.now() - start);
      await new Promise((r) => setTimeout(r, 40));
    }
    // Tras la última tecla, cuánto tarda en reflejarse el resultado final.
    const settleStart = performance.now();
    const expected = ${JSON.stringify('')};
    let last = document.querySelector('[data-testid=hi-count]').innerText;
    let stable = 0;
    while (stable < 6 && performance.now() - settleStart < 5000) {
      await new Promise((r) => setTimeout(r, 50));
      const now = document.querySelector('[data-testid=hi-count]').innerText;
      stable = now === last ? stable + 1 : 0;
      last = now;
    }
    const settleMs = performance.now() - settleStart - stable * 50;
    observer.disconnect();
    return { keystroke, settleMs, longTasks, count: last, rows: document.querySelectorAll('[data-testid=hi-row]').length };
  })()`);

  const max = Math.max(...typing.keystroke);
  const avg = typing.keystroke.reduce((a, b) => a + b, 0) / typing.keystroke.length;
  const report = {
    label: LABEL, seeded: COUNT, loadMs, rowsRendered,
    keystrokeAvgMs: Math.round(avg), keystrokeMaxMs: Math.round(max),
    settleMs: Math.round(typing.settleMs), longestTaskMs: Math.round(Math.max(0, ...typing.longTasks)),
    resultCount: typing.count, rowsAfterSearch: typing.rows,
  };
  console.log(JSON.stringify(report, null, 2));
  await c.screenshot(`${dir}/perf-${LABEL}.png`);

  // Limpieza: se borran los datos sembrados del perfil aislado.
  await c.evaluate(`localStorage.removeItem(${JSON.stringify(STORAGE_KEY)}); localStorage.removeItem(${JSON.stringify(FOLIO_KEY)});`);
  if (process.env.ENFORCE === '1') {
    assert.ok(max < 100, `Una actualización tardó ${Math.round(max)} ms (límite 100 ms)`);
    assert.ok(rowsRendered <= 20, `Se renderizaron ${rowsRendered} filas (máx. 20 por página)`);
  }
} finally {
  c.close();
}
