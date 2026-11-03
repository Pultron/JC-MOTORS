import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { connect } from './cdpClient.mjs';

// Requiere `npm run dev` (APP_URL) y un navegador con --remote-debugging-port=CDP_PORT (9223 por defecto).
const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const dir = 'tests/artifacts/clientes';
await mkdir(dir, { recursive: true });

const STORAGE_KEY = 'jc-motors:customers:v1';
const seed = [
  { id: 'c-carlos', name: 'Carlos Méndez', phone: '55 1234 5678', email: 'carlos@correo.com', aliases: [] },
  { id: 'c-jesus', name: 'Jesús Pérez', phone: '55 0000 1234', email: 'jesus.perez@example.com', aliases: ['Chuyito'] },
  { id: 'c-mariana', name: 'Mariana López', phone: '55 1234 5678', email: 'mariana@example.com', aliases: ['Mari'] },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const q = (selector) => JSON.stringify(selector);

const c = await connect(Number(process.env.CDP_PORT ?? 9223));
try {
  const text = (selector) => c.evaluate(`document.querySelector(${q(selector)})?.innerText.trim() ?? null`);
  const count = (selector) => c.evaluate(`document.querySelectorAll(${q(selector)}).length`);
  const rowNames = () => c.evaluate('[...document.querySelectorAll("[data-testid=cli-row] h3")].map((h) => h.childNodes[0].textContent.trim())');
  const chips = () => c.evaluate('[...document.querySelectorAll("[data-testid=cli-chip]")].map((chip) => chip.childNodes[0].textContent.trim())');
  const focus = (selector) => c.evaluate(`document.querySelector(${q(selector)}).focus()`);
  const typeText = async (value) => { for (const char of value) await c.send('Input.dispatchKeyEvent', { type: 'char', text: char, key: char }); };
  const press = async (key, code, vk, text) => {
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  };
  const rowOf = (name) => `[...document.querySelectorAll("[data-testid=cli-row]")].find((row) => row.querySelector("h3").childNodes[0].textContent.trim() === ${JSON.stringify(name)})`;
  const clickIn = (name, testid) => c.evaluate(`${rowOf(name)}.querySelector("[data-testid=${testid}]").click()`);
  const storedNames = () => c.evaluate(`JSON.parse(localStorage.getItem(${q(STORAGE_KEY)}) || '[]').map((customer) => customer.name)`);
  const loadSeeded = async () => {
    await c.evaluate(`localStorage.setItem(${q(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(seed))}); location.reload()`);
    await c.waitFor('Boolean(document.querySelector("[data-testid=clientes-page]"))');
  };

  await c.send('Page.navigate', { url: `${BASE}/#/clientes` });
  await c.waitFor('Boolean(document.querySelector("[data-testid=clientes-page]"))');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1586, height: 992, deviceScaleFactor: 1, mobile: false });
  await loadSeeded();

  // 1. Título, contador y filas
  assert.equal(await text('.cli-header h1'), 'Clientes');
  assert.equal(await text('[data-testid=cli-count]'), '3 clientes disponibles para cotizar.');
  assert.deepEqual(await rowNames(), ['Carlos Méndez', 'Jesús Pérez', 'Mariana López']);
  assert.equal(await text('[data-testid=cli-row] .cli-avatar'), 'CM');

  // 2. Agregar sin nombre
  await c.click('[data-testid=cli-submit]');
  await c.waitFor('Boolean(document.querySelector("[data-testid=cli-error]"))');
  assert.equal(await text('[data-testid=cli-error]'), 'Escribe el nombre del cliente.');
  assert.equal(await c.evaluate('document.activeElement.id'), 'cli-name');
  assert.equal(await count('[data-testid=cli-row]'), 3, 'no debe agregar nada');
  await sleep(900); // deja terminar la animación de entrada de las tarjetas
  await c.screenshot(`${dir}/error.png`);
  await c.fill('[data-testid=cli-name]', 'N');
  assert.equal(await count('[data-testid=cli-error]'), 0, 'el error se limpia al escribir');
  await c.fill('[data-testid=cli-name]', '');

  // 3. Apodos con coma, sin duplicar
  await focus('[data-testid=cli-alias-input]');
  await typeText('Chuy,');
  assert.deepEqual(await chips(), ['Chuy']);
  await typeText('Chucho,');
  assert.deepEqual(await chips(), ['Chuy', 'Chucho']);
  await typeText('chuy,');
  assert.deepEqual(await chips(), ['Chuy', 'Chucho'], '"chuy" no duplica "Chuy"');
  assert.equal(await c.evaluate('document.querySelector("[data-testid=cli-alias-input]").value'), '');
  assert.equal(await c.evaluate('document.querySelector("[data-testid=cli-alias-input]").placeholder'), '', 'sin placeholder con chips');

  // 4. Backspace con el campo vacío quita el último chip
  await press('Backspace', 'Backspace', 8);
  assert.deepEqual(await chips(), ['Chuy']);
  await typeText('Chucho,');
  assert.deepEqual(await chips(), ['Chuy', 'Chucho']);

  // 5. Agregar: primera fila, con destello que desaparece (Enter con el campo vacío envía el formulario)
  await c.fill('[data-testid=cli-name]', 'Nuevo Cliente');
  await c.fill('[data-testid=cli-phone]', '55 9999 0000');
  await focus('[data-testid=cli-alias-input]');
  await press('Enter', 'Enter', 13, '\r');
  await c.waitFor('document.querySelectorAll("[data-testid=cli-row]").length === 4');
  assert.deepEqual(await rowNames(), ['Nuevo Cliente', 'Carlos Méndez', 'Jesús Pérez', 'Mariana López']);
  assert.equal(await c.evaluate('document.querySelector("[data-testid=cli-row]").classList.contains("is-flash")'), true);
  assert.deepEqual(await c.evaluate('[...document.querySelector("[data-testid=cli-row]").querySelectorAll(".cli-pill")].map((pill) => pill.textContent)'), ['Chuy', 'Chucho']);
  assert.equal(await c.evaluate('document.querySelector("[data-testid=cli-name]").value'), '', 'el formulario se limpia');
  assert.equal(await count('[data-testid=cli-chip]'), 0);
  assert.equal(await text('[data-testid=cli-count]'), '4 clientes disponibles para cotizar.');
  await sleep(2300);
  assert.equal(await c.evaluate('document.querySelector("[data-testid=cli-row]").classList.contains("is-flash")'), false, 'el destello se limpia solo');

  // Lo que queda escrito sin confirmar entra como chip al guardar
  await c.fill('[data-testid=cli-name]', 'Pedro Gómez');
  await focus('[data-testid=cli-alias-input]');
  await typeText('Pepe');
  await c.click('[data-testid=cli-submit]');
  await c.waitFor('document.querySelectorAll("[data-testid=cli-row]").length === 5');
  assert.deepEqual(await c.evaluate('[...document.querySelector("[data-testid=cli-row]").querySelectorAll(".cli-pill")].map((pill) => pill.textContent)'), ['Pepe']);
  await clickIn('Pedro Gómez', 'cli-delete');
  await clickIn('Pedro Gómez', 'cli-delete-confirm');
  await c.waitFor('document.querySelectorAll("[data-testid=cli-row]").length === 4');

  // 6. Búsqueda por apodo, nombre parcial y teléfono sin espacios
  await c.fill('[data-testid=cli-search]', 'chuyito');
  assert.deepEqual(await rowNames(), ['Jesús Pérez']);
  await c.fill('[data-testid=cli-search]', 'mend');
  assert.deepEqual(await rowNames(), ['Carlos Méndez']);
  await c.fill('[data-testid=cli-search]', '5512');
  assert.deepEqual(await rowNames(), ['Carlos Méndez', 'Mariana López']);
  await c.fill('[data-testid=cli-search]', '55000012');
  assert.deepEqual(await rowNames(), ['Jesús Pérez']);

  // 7. Sin resultados y limpiar con la "×"
  await c.fill('[data-testid=cli-search]', 'zzzz');
  assert.equal(await count('[data-testid=cli-row]'), 0);
  assert.equal(await text('[data-testid=cli-empty] strong'), 'Sin resultados');
  await c.click('[data-testid=cli-search-clear]');
  assert.equal(await count('[data-testid=cli-row]'), 4);
  assert.equal(await count('[data-testid=cli-search-clear]'), 0, 'la × solo aparece con texto');

  // 8. Editar: el formulario cambia, la fila muestra "Editando" y guardar no duplica
  await clickIn('Jesús Pérez', 'cli-edit');
  assert.equal(await text('#cli-form-title'), 'Editar cliente');
  assert.equal(await text('[data-testid=cli-submit]'), 'Guardar cambios');
  assert.equal(await c.evaluate('document.querySelector("[data-testid=cli-name]").value'), 'Jesús Pérez');
  assert.deepEqual(await chips(), ['Chuyito']);
  assert.equal(await c.evaluate('document.activeElement.id'), 'cli-name');
  assert.equal(await c.evaluate(`${rowOf('Jesús Pérez')}.querySelector(".cli-editing-badge").textContent`), 'Editando');
  assert.equal(await count('[data-testid=cli-cancel]'), 1);
  await c.fill('[data-testid=cli-name]', 'Jesús Pérez Ruiz');
  await c.click('[data-testid=cli-submit]');
  await c.waitFor(`Boolean(${rowOf('Jesús Pérez Ruiz')})`);
  assert.equal(await count('[data-testid=cli-row]'), 4);
  assert.equal(await text('#cli-form-title'), 'Agregar cliente');
  assert.equal(await c.evaluate(`${rowOf('Jesús Pérez Ruiz')}.classList.contains("is-flash")`), true);
  assert.equal(await c.evaluate('document.querySelectorAll(".cli-editing-badge").length'), 0);
  assert.ok((await storedNames()).includes('Jesús Pérez Ruiz'));
  await sleep(400);
  await c.screenshot(`${dir}/clientes.png`);

  // 9. Eliminar con confirmación inline
  await clickIn('Mariana López', 'cli-delete');
  assert.match(await text('.cli-item.is-confirming .cli-confirm-text'), /¿Eliminar a Mariana López\?/);
  await clickIn('Mariana López', 'cli-delete-cancel');
  assert.equal(await count('[data-testid=cli-row]'), 4);
  assert.equal(await count('.cli-confirm-text'), 0);
  await clickIn('Mariana López', 'cli-delete');
  await clickIn('Mariana López', 'cli-delete-confirm');
  await c.waitFor('document.querySelectorAll("[data-testid=cli-row]").length === 3');
  assert.equal(await text('[data-testid=cli-count]'), '3 clientes disponibles para cotizar.');
  for (const name of ['Nuevo Cliente', 'Carlos Méndez']) {
    await clickIn(name, 'cli-delete');
    await clickIn(name, 'cli-delete-confirm');
  }
  await c.waitFor('document.querySelectorAll("[data-testid=cli-row]").length === 1');
  assert.equal(await text('[data-testid=cli-count]'), '1 cliente disponible para cotizar.');
  assert.deepEqual(await storedNames(), ['Jesús Pérez Ruiz']);
  await clickIn('Jesús Pérez Ruiz', 'cli-delete');
  await clickIn('Jesús Pérez Ruiz', 'cli-delete-confirm');
  await c.waitFor('document.querySelectorAll("[data-testid=cli-row]").length === 0');
  assert.equal(await text('[data-testid=cli-empty] strong'), 'Aún no hay clientes');
  assert.equal(await text('[data-testid=cli-count]'), '0 clientes disponibles para cotizar.');

  // 10. Con movimiento reducido ninguna fila queda con el destello pegado
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await c.fill('[data-testid=cli-name]', 'Sin Animación');
  await c.click('[data-testid=cli-submit]');
  await c.waitFor('document.querySelectorAll("[data-testid=cli-row]").length === 1');
  await sleep(2400);
  assert.equal(await c.evaluate('document.querySelectorAll(".is-flash, .cli-flash").length'), 0);
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  assert.deepEqual(c.errors, []);
  console.log('clientes: OK');
} finally {
  await c.evaluate(`localStorage.removeItem(${q(STORAGE_KEY)})`).catch(() => {});
  c.close();
}
