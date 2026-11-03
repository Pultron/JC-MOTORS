import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { connect } from './cdpClient.mjs';

// Requiere `npm run dev` (APP_URL) y un navegador con --remote-debugging-port=CDP_PORT (9223 por defecto).
const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const dir = 'tests/artifacts/historial';
await mkdir(dir, { recursive: true });

const STORAGE_KEY = 'jc-motors:quotations:v1';
const DRAFTS_KEY = 'jc-motors:quote-drafts:v1';

const labor = (amount) => [{ id: `i-${amount}`, type: 'labor', description: 'Mano de obra', quantity: 1, saleUnitPrice: amount, amount }];
const quotation = (n, createdAt, name, make, model, total, status) => ({
  id: `q${n}`, folio: `JC-${String(n).padStart(4, '0')}`, createdAt,
  customer: { name, phone: '' }, vehicle: { make, model, plates: '' },
  items: labor(total), laborDiscountType: 'fixed', laborDiscountValue: 0, includeVat: false,
  validityDays: 36500, publicNotes: '', customerNotes: '', status,
  ...(status === 'Aprobada' ? { approvedAt: createdAt } : {}),
});
const seed = [
  quotation(1, '2026-10-31T12:00:00Z', 'maria', 'Chevrolet', 'Onix', 1111, 'Aprobada'),
  quotation(2, '2026-10-31T13:00:00Z', 'Carlos Rivera', 'Ford', 'Ranger', 3840, 'Aprobada'),
  quotation(3, '2026-11-01T12:00:00Z', 'Ana Beltrán', 'Honda', 'Civic', 1590, 'Cancelada'),
  quotation(4, '2026-11-01T13:00:00Z', 'Jorge Lizárraga', 'Nissan', 'Versa', 2475.5, 'Aprobada'),
  quotation(5, '2026-11-02T12:05:00Z', 'Luis Ortega', 'Toyota', 'Hilux', 5220, 'Pendiente'),
  quotation(6, '2026-11-02T12:06:00Z', 'Sofía Zazueta', 'Volkswagen', 'Jetta', 1980, 'Pendiente'),
  quotation(7, '2026-11-02T12:07:00Z', 'Pedro Quintero', 'Chevrolet', 'Aveo', 4100, 'Aprobada'),
  quotation(8, '2026-11-02T12:08:00Z', 'Diana Camacho', 'Mazda', '3', 2900, 'Pendiente'),
  quotation(9, '2026-11-02T12:09:00Z', 'Luis Ortega', 'Toyota', 'Hilux', 6150, 'Pendiente'),
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const q = (selector) => JSON.stringify(selector);

const c = await connect(Number(process.env.CDP_PORT ?? 9223));
try {
  const text = (selector) => c.evaluate(`document.querySelector(${q(selector)})?.innerText.trim() ?? null`);
  const count = (selector) => c.evaluate(`document.querySelectorAll(${q(selector)}).length`);
  const folios = () => c.evaluate('[...document.querySelectorAll("[data-testid=hi-row]")].map((row) => row.dataset.folio)');
  const statusLabel = () => text('[data-testid=hi-status] .hi-ctl-text');
  const rangeText = () => text('[data-testid=hi-range] .hi-ctl-text');
  const focus = (selector) => c.evaluate(`document.querySelector(${q(selector)}).focus()`);
  const press = async (key, code, vk, keyText) => {
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, ...(keyText ? { text: keyText } : {}) });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  };
  const arrowDown = () => press('ArrowDown', 'ArrowDown', 40);
  const enter = () => press('Enter', 'Enter', 13, '\r');
  const escape = () => press('Escape', 'Escape', 27);
  const centerOf = (selector) => c.evaluate(`(() => { const r = document.querySelector(${q(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const mouseClick = async ({ x, y }) => {
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const hasMenu = (kind) => count(kind === 'range' ? '.profit-range-popover' : `[data-testid=hi-${kind}-menu]`);
  const waitRows = (n) => c.waitFor(`document.querySelectorAll("[data-testid=hi-row]").length === ${n}`);
  const openRange = async () => {
    if (!(await count('.profit-range-popover'))) await c.click('[data-testid=hi-range]');
    await c.waitFor('Boolean(document.querySelector(".profit-range-popover"))');
  };
  // Mes que muestra el calendario: el día 15 de la cuadrícula siempre cae dentro del mes visible.
  const shownMonth = () => c.evaluate('document.querySelectorAll(".profit-cal-grid [data-date]")[14].dataset.date.slice(0, 7)');
  const goToMonth = async (key) => {
    for (let i = 0; i < 48 && (await shownMonth()) !== key; i += 1) {
      await c.click((await shownMonth()) > key ? '.profit-cal-prev' : '.profit-cal-next');
    }
    assert.equal(await shownMonth(), key);
  };
  const pickDay = (iso) => c.click(`.profit-cal-grid [data-date="${iso}"]`);
  const applyRange = () => c.click('.profit-cal-actions .profit-primary');
  const loadSeeded = async () => {
    await c.evaluate(`localStorage.setItem(${q(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(seed))}); localStorage.removeItem(${q(DRAFTS_KEY)}); location.reload()`);
    await c.waitFor('document.querySelectorAll("[data-testid=hi-row]").length === 9');
    await sleep(900); // deja terminar la animación de entrada
  };

  await c.send('Page.navigate', { url: `${BASE}/#/historial` });
  await c.waitFor('Boolean(document.querySelector("[data-testid=historial-page]"))');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1586, height: 992, deviceScaleFactor: 1, mobile: false });
  await loadSeeded();

  // 1. Título, conteo y orden de más reciente a más antigua
  assert.equal(await text('.hi-header h1'), 'Historial');
  assert.equal(await text('[data-testid=hi-count]'), '9 cotizaciones');
  assert.deepEqual(await folios(), ['JC-0009', 'JC-0008', 'JC-0007', 'JC-0006', 'JC-0005', 'JC-0004', 'JC-0003', 'JC-0002', 'JC-0001']);
  assert.equal(await text('[data-testid=hi-row] .hi-total'), 'MXN $6,150.00');
  assert.equal(await c.evaluate('document.querySelector("[data-testid=hi-search]").getAttribute("aria-label")'), 'Buscar por folio, cliente o vehículo');
  assert.equal(await count('thead th.hi-sr-only'), 1, 'la columna de acciones lleva encabezado oculto');
  assert.equal(await rangeText(), 'Todas las fechas');
  await c.click('[data-testid=hi-range]');
  await c.waitFor('Boolean(document.querySelector(".profit-range-popover"))');
  await sleep(250);
  await c.screenshot(`${dir}/historial.png`);
  assert.match(await text('.profit-range-popover'), /Aplicar rango/);
  await c.click('[data-testid=hi-range]');
  await c.waitFor('!document.querySelector(".profit-range-popover")');

  // 2. Búsqueda por vehículo y por folio
  await c.fill('[data-testid=hi-search]', 'onix');
  await waitRows(1);
  assert.deepEqual(await folios(), ['JC-0001']);
  assert.equal(await text('[data-testid=hi-count]'), '1 cotización');
  await c.fill('[data-testid=hi-search]', 'JC-0003');
  await waitRows(1);
  assert.deepEqual(await folios(), ['JC-0003']);
  await c.fill('[data-testid=hi-search]', '');
  await waitRows(9);
  assert.equal(await count('[data-testid=hi-clear]'), 0, 'sin filtros no hay "Limpiar filtros"');

  // 3. Combo de estado: opciones con conteo y filtro
  await c.click('[data-testid=hi-status]');
  await c.waitFor('Boolean(document.querySelector("[data-testid=hi-status-menu]"))');
  assert.deepEqual(
    await c.evaluate('[...document.querySelectorAll("[data-testid=hi-status-option]")].map((o) => o.innerText.replace(/\\s+/g, " ").trim())'),
    ['Todas 9', 'Aprobada 4', 'Pendiente 4', 'Cancelada 1', 'Vencida 0'],
  );
  assert.equal(await c.evaluate('document.querySelector("[data-testid=hi-status]").getAttribute("role")'), 'combobox');
  await c.evaluate('document.querySelector("[data-testid=hi-status-option][data-value=Pendiente]").click()');
  await waitRows(4);
  assert.equal(await statusLabel(), 'Pendiente');
  assert.equal(await hasMenu('status'), 0, 'elegir cierra el menú');
  assert.equal(await count('[data-testid=hi-clear]'), 1);

  // 4. Teclado: flechas, Enter elige, Escape cierra sin cambiar
  await focus('[data-testid=hi-status]');
  await arrowDown();
  await c.waitFor('Boolean(document.querySelector("[data-testid=hi-status-menu]"))');
  await arrowDown();
  await enter();
  await waitRows(1);
  assert.equal(await statusLabel(), 'Cancelada');
  assert.deepEqual(await folios(), ['JC-0003']);
  await arrowDown();
  await c.waitFor('Boolean(document.querySelector("[data-testid=hi-status-menu]"))');
  await arrowDown();
  await escape();
  await c.waitFor('!document.querySelector("[data-testid=hi-status-menu]")');
  assert.equal(await statusLabel(), 'Cancelada', 'Escape no cambia el estado');
  await c.click('[data-testid=hi-clear]');
  await waitRows(9);
  assert.equal(await statusLabel(), 'Todas');

  // 5. Filtro por rango de fechas (mismo calendario que Control interno)
  await openRange();
  await goToMonth('2026-10');
  await pickDay('2026-10-31');
  assert.equal(await c.evaluate('document.querySelector(".profit-cal-actions .profit-primary").disabled'), true, 'sin fecha final no se puede aplicar');
  await goToMonth('2026-11');
  await pickDay('2026-11-01');
  await applyRange();
  await waitRows(4);
  assert.deepEqual(await folios(), ['JC-0004', 'JC-0003', 'JC-0002', 'JC-0001']);
  assert.match(await rangeText(), /31 oct.*1 nov/);
  assert.equal(await hasMenu('range'), 0, 'aplicar el rango cierra el calendario');
  assert.equal(await text('[data-testid=hi-count]'), '4 cotizaciones');
  assert.equal(await count('[data-testid=hi-clear]'), 1, 'con rango activo aparece "Limpiar filtros"');
  // El rango se combina con el estado y los conteos del combo lo respetan.
  await c.evaluate('document.querySelector("[data-testid=hi-status]").click()');
  assert.equal(await text('[data-testid=hi-status-option][data-value=Aprobada] .hi-option-count'), '3');
  await c.evaluate('document.querySelector("[data-testid=hi-status-option][data-value=Cancelada]").click()');
  await waitRows(1);
  assert.deepEqual(await folios(), ['JC-0003']);
  await c.click('[data-testid=hi-clear]');
  await waitRows(9);
  assert.equal(await rangeText(), 'Todas las fechas', 'Limpiar filtros también quita el rango');
  assert.equal(await statusLabel(), 'Todas');
  // Un solo día: dos clics en la misma fecha.
  await openRange();
  await goToMonth('2026-11');
  await pickDay('2026-11-02');
  await pickDay('2026-11-02');
  await applyRange();
  await waitRows(5);
  // Cancelar no cambia nada; el calendario abre en el mes del rango activo; la X quita el filtro.
  await openRange();
  assert.equal(await shownMonth(), '2026-11', 'abre en el mes del rango activo');
  await pickDay('2026-11-01');
  await c.click('.profit-cal-actions .profit-outline');
  await c.waitFor('!document.querySelector(".profit-range-popover")');
  assert.equal(await count('[data-testid=hi-row]'), 5);
  await c.click('[data-testid=hi-range-clear]');
  await waitRows(9);
  assert.equal(await rangeText(), 'Todas las fechas');
  assert.equal(await count('[data-testid=hi-range-clear]'), 0);
  // Sin coincidencias en el rango: estado vacío con "Limpiar filtros".
  await openRange();
  await goToMonth('2026-09');
  await pickDay('2026-09-10');
  await pickDay('2026-09-11');
  await applyRange();
  await c.waitFor('Boolean(document.querySelector("[data-testid=hi-empty]"))');
  await c.click('[data-testid=hi-empty-clear]');
  await waitRows(9);
  assert.equal(await rangeText(), 'Todas las fechas');

  // 6. Clic fuera cierra; solo un menú abierto a la vez (clics reales, para probar las capas)
  await c.click('[data-testid=hi-status]');
  await c.waitFor('Boolean(document.querySelector("[data-testid=hi-status-menu]"))');
  await mouseClick(await centerOf('[data-testid=hi-row]:last-child .hi-client'));
  await c.waitFor('!document.querySelector("[data-testid=hi-status-menu]")');
  assert.equal(await count('[data-testid=hi-backdrop]'), 0);
  assert.equal(await c.evaluate('location.hash'), '#/historial', 'el clic fuera no activa lo que hay debajo');
  await c.click('[data-testid=hi-status]');
  await c.waitFor('Boolean(document.querySelector("[data-testid=hi-status-menu]"))');
  await mouseClick(await centerOf('[data-testid=hi-range]'));
  await c.waitFor('Boolean(document.querySelector(".profit-range-popover"))');
  assert.equal((await count('.hi-menu')) + (await count('.profit-range-popover')), 1, 'abrir uno cierra el otro');
  assert.equal(await hasMenu('status'), 0);
  await focus('[data-testid=hi-range]');
  await escape();
  await c.waitFor('!document.querySelector(".profit-range-popover")');
  // Clic fuera del calendario abierto: se cierra sin aplicar nada.
  await c.click('[data-testid=hi-range]');
  await c.waitFor('Boolean(document.querySelector(".profit-range-popover"))');
  await mouseClick(await centerOf('[data-testid=hi-row]:last-child .hi-client'));
  await c.waitFor('!document.querySelector(".profit-range-popover")');
  assert.equal(await count('[data-testid=hi-backdrop]'), 0);
  assert.equal(await c.evaluate('location.hash'), '#/historial');

  // 7. Sin resultados y restauración
  await c.fill('[data-testid=hi-search]', 'zzzz');
  await c.waitFor('Boolean(document.querySelector("[data-testid=hi-empty]"))');
  assert.match(await text('[data-testid=hi-empty]'), /Sin resultados/);
  assert.equal(await text('[data-testid=hi-count]'), '0 cotizaciones');
  await c.fill('[data-testid=hi-search]', 'onix');
  await c.evaluate('document.querySelector("[data-testid=hi-status]").click()');
  await c.evaluate('document.querySelector("[data-testid=hi-status-option][data-value=Pendiente]").click()');
  await c.waitFor('Boolean(document.querySelector("[data-testid=hi-empty]"))');
  await c.click('[data-testid=hi-empty-clear]');
  await waitRows(9);
  assert.equal(await c.evaluate('document.querySelector("[data-testid=hi-search]").value'), '');
  assert.equal(await statusLabel(), 'Todas');

  // 8. Duplicar: arriba, Pendiente, siguiente folio, filtros limpios, destello y toast
  await c.evaluate('document.querySelector("[data-testid=hi-status]").click()');
  await c.evaluate('document.querySelector("[data-testid=hi-status-option][data-value=Pendiente]").click()');
  await waitRows(4);
  await c.click('[data-testid=hi-dup-JC-0009]');
  await waitRows(10);
  assert.deepEqual((await folios()).slice(0, 2), ['JC-0010', 'JC-0009']);
  assert.equal(await text('[data-testid=hi-row] [data-testid=hi-badge]'), 'Pendiente');
  assert.equal(await text('[data-testid=hi-row] .hi-client'), 'Luis Ortega');
  assert.equal(await statusLabel(), 'Todas', 'los filtros se limpian');
  assert.equal(await text('[data-testid=hi-toast]'), 'Cotización duplicada como JC-0010');
  assert.equal(await c.evaluate('document.querySelector("[data-testid=hi-row]").classList.contains("hi-flash")'), true, 'la fila nueva destella');
  assert.equal(await c.evaluate('document.body.innerText.includes("Cotización creada")'), false, 'no se duplica el aviso del store');
  await c.screenshot(`${dir}/duplicada.png`);
  await sleep(2400);
  assert.equal(await count('.hi-flash'), 0, 'el destello se limpia solo');
  await sleep(1300);
  assert.equal(await count('[data-testid=hi-toast]'), 0, 'el toast se va solo');

  // 9. Dos duplicados seguidos: el primer temporizador no cierra el segundo toast
  await c.click('[data-testid=hi-dup-JC-0009]');
  await c.waitFor('document.querySelector("[data-testid=hi-toast]")?.innerText.includes("JC-0011")');
  await sleep(1500);
  await c.click('[data-testid=hi-dup-JC-0009]');
  await c.waitFor('document.querySelector("[data-testid=hi-toast]")?.innerText.includes("JC-0012")');
  await sleep(2100); // más de 3.3 s desde el primero
  assert.equal(await text('[data-testid=hi-toast]'), 'Cotización duplicada como JC-0012');
  assert.equal(await c.evaluate('getComputedStyle(document.querySelector("[data-testid=hi-toast]")).opacity'), '1');
  await sleep(1500);
  assert.equal(await count('[data-testid=hi-toast]'), 0);

  // 10. Con movimiento reducido no queda ninguna fila con el destello pegado
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await c.click('[data-testid=hi-dup-JC-0009]');
  await c.waitFor('document.querySelector("[data-testid=hi-row]").dataset.folio === "JC-0013"');
  assert.equal(await c.evaluate('getComputedStyle(document.querySelector(".hi-flash td")).animationName'), 'none');
  await sleep(2400);
  assert.equal(await count('.hi-flash'), 0);
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  // 11. Ventana angosta: la tabla hace scroll horizontal y los menús no se cortan
  await c.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  assert.equal(await c.evaluate('(() => { const w = document.querySelector(".hi-table-wrap"); return w.scrollWidth > w.clientWidth; })()'), true);
  for (const kind of ['status', 'range']) {
    const menu = kind === 'range' ? '.profit-range-popover' : '.hi-menu';
    await c.click(`[data-testid=hi-${kind}]`);
    await c.waitFor(`Boolean(document.querySelector(${q(menu)}))`);
    await sleep(300); // deja terminar la animación de entrada antes de medir
    const rect = await c.evaluate(`(() => { const r = document.querySelector(${q(menu)}).getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth }; })()`);
    assert.ok(rect.left >= 0 && rect.right <= rect.width, `el menú ${kind} cabe en la ventana: ${JSON.stringify(rect)}`);
    if (kind === 'range') await c.screenshot(`${dir}/angosta.png`);
    await c.click(`[data-testid=hi-${kind}]`);
    await c.waitFor(`!document.querySelector(${q(menu)})`);
  }

  assert.deepEqual(c.errors, [], 'sin excepciones en la consola');
  console.log('historial: OK');
} finally {
  await c.evaluate(`localStorage.removeItem(${q(STORAGE_KEY)})`).catch(() => undefined);
  await c.send('Emulation.clearDeviceMetricsOverride').catch(() => undefined);
  c.close();
}
