import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { connect } from './cdpClient.mjs';

// Humo final del lote 5 en la app COMPILADA (perfil aislado): crear una cotización de 12 conceptos guardando con el botón,
// verla en el historial, cliente nuevo con correo y recorrido con Tab. Reporta errores de consola y violaciones de CSP.
const BASE = process.env.APP_URL ?? 'http://tauri.localhost';
const dir = 'tests/artifacts/humo';
await mkdir(dir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const q = (s) => JSON.stringify(s);
const c = await connect(Number(process.env.CDP_PORT ?? 9224));
const consoleErrors = [];
c.send('Runtime.enable');
const key = (k, code, vk, modifiers = 0) => c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers }).then(() => c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }));
// Like c.fill, but picks the right prototype (some fields are <textarea>).
const fill = (selector, value) => c.evaluate(`(() => { const e = document.querySelector(${q(selector)}); e.focus(); const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${q(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const go = async (path) => { await c.evaluate(`location.hash = ${q(path)}`); await sleep(900); };

try {
  await c.send('Page.enable');
  await c.send('Page.navigate', { url: `${BASE}/#/` });
  await c.waitFor('document.readyState === "complete"');
  const existing = await c.evaluate(`localStorage.getItem('jc-motors:quotations:v1')`);
  assert.ok(existing === null || existing === '[]', 'El perfil tiene datos: abortado sin tocar nada');
  await c.send('Page.navigate', { url: `${BASE}/?humo=${Date.now()}#/nueva-cotizacion` });
  await sleep(1500);

  // Cliente y vehículo
  await fill('[data-testid=cliente-nombre]', 'Roberto Salazar');
  await fill('[data-testid=cliente-telefono]', '6671234567');
  await fill('[data-testid=cliente-correo]', 'roberto@gmail.com');
  await fill('[data-testid=vehiculo-marca]', 'Toyota');
  await fill('[data-testid=vehiculo-modelo]', 'Hilux');
  await c.pick('[data-testid=vehiculo-anio]', 2019);
  await fill('[data-testid=vehiculo-placas]', 'XYZ-987-A');

  // 12 conceptos
  for (let i = 0; i < 12; i++) {
    if (!(await c.evaluate(`Boolean(document.querySelector('[data-testid=refaccion-descripcion-${i}]'))`))) {
      await c.click('[data-testid=refaccion-agregar]');
      await c.waitFor(`Boolean(document.querySelector('[data-testid=refaccion-descripcion-${i}]'))`);
    }
    await fill(`[data-testid=refaccion-descripcion-${i}]`, `Concepto ${i + 1} balatas y mano de obra de prueba`);
    await fill(`[data-testid=refaccion-cantidad-${i}]`, '1');
    await fill(`[data-testid=refaccion-precio-${i}]`, String(500 + i * 10));
  }
  await sleep(500);
  console.log('conceptos:', await c.evaluate('document.querySelectorAll("[data-testid^=refaccion-fila-]").length'), '| hojas:', await c.evaluate('document.querySelector("[data-testid=resumen-hojas]")?.innerText'));
  await c.screenshot(`${dir}/01-cotizacion-12-conceptos.png`);

  // El botón guarda la cotización
  await c.click('[data-testid=guardar-cotizacion]');
  await sleep(1800);
  await c.screenshot(`${dir}/02-guardada.png`);
  const saved = await c.evaluate(`JSON.parse(localStorage.getItem('jc-motors:quotations:v1') ?? '[]').map((x) => ({ folio: x.folio, items: x.items.length, customer: x.customer.name }))`);
  console.log('guardadas:', JSON.stringify(saved));
  assert.equal(saved.length, 1, 'Guardar debe guardar la cotización');
  assert.equal(saved[0].items, 12);

  // Historial con la cotización, búsqueda por teléfono con formato
  await go('/historial');
  await fill('[data-testid=hi-search]', '(667) 123-4567');
  await sleep(500);
  assert.equal(await c.evaluate('document.querySelectorAll("[data-testid=hi-row]").length'), 1);

  // Cliente nuevo con correo (sugerencia de dominio) en Clientes
  await go('/clientes');
  await fill('[data-testid=cli-name]', 'Laura Mendoza');
  await fill('[data-testid=cli-phone]', '6679876543');
  await fill('[data-testid=cli-email]', 'laura@gmail.com');
  await c.evaluate('document.querySelector("form button[type=submit]").click()');
  await sleep(900);
  assert.equal(await c.evaluate('[...document.querySelectorAll("[data-testid=cli-row]")].some((row) => row.innerText.includes("Laura Mendoza") && row.innerText.includes("laura@gmail.com"))'), true, 'El cliente nuevo (con correo) debe aparecer en la lista');
  await c.screenshot(`${dir}/03-clientes.png`);

  // Tab por las pantallas: debe haber un elemento enfocado distinto en cada pulsación
  for (const route of ['/', '/nueva-cotizacion', '/historial', '/clientes', '/facturas', '/respaldo']) {
    await go(route);
    const seen = new Set();
    for (let i = 0; i < 6; i++) {
      await key('Tab', 'Tab', 9);
      seen.add(await c.evaluate('(() => { const e = document.activeElement; return [e.tagName, e.getAttribute("data-testid"), e.getAttribute("aria-label"), e.id, e.textContent.slice(0, 20)].join(":"); })()'));
    }
    assert.ok(seen.size >= 3, `Tab no avanza en ${route}`);
  }

  console.log(c.violations.length === 0 ? 'SIN violaciones de CSP' : 'VIOLACIONES: ' + [...new Set(c.violations)].join(' | '));
  console.log('Excepciones de página:', JSON.stringify(c.errors));
} finally {
  await c.evaluate('localStorage.clear()').catch(() => undefined);
  c.close();
}
