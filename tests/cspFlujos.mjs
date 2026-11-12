import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connect } from './cdpClient.mjs';
import { cfdiXml, UUID_1 } from './facturasFixtures.mjs';
import { installMemoryStorage } from './memoryStorage.mjs';
import { buildBackup, serializeBackup } from '../src/storage/backupService.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';

// #040: recorre los flujos de la app y reporta violaciones de Content Security Policy.
// Pensado para la app COMPILADA de Tauri (APP_URL=http://tauri.localhost) con un perfil de WebView2 aislado:
//   WEBVIEW2_USER_DATA_FOLDER=<carpeta temporal> WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9224
// Ejecutar con: node --experimental-strip-types --loader ./tests/ts-loader.mjs tests/cspFlujos.mjs
const BASE = process.env.APP_URL ?? 'http://tauri.localhost';
const WORK = process.env.WORK_DIR ?? 'tests/artifacts/csp';
await mkdir(WORK, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const q = (s) => JSON.stringify(s);

const items = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, type: i % 3 ? 'part' : 'labor', description: `Concepto de prueba número ${i + 1} con descripción larga para ocupar espacio en la hoja`, quantity: 1, saleUnitPrice: 500 + i * 10, amount: 500 + i * 10 }));
const quotation = {
  id: 'csp-1', folio: 'JC-0001', createdAt: '2026-10-01T10:00:00.000Z', status: 'Pendiente', customerId: 'cu1',
  customer: { name: 'María López', phone: '6671112233', email: 'maria@correo.com' }, vehicle: { make: 'Honda', model: 'Civic', year: 2018, plates: 'ABC-123' },
  items, laborDiscountType: 'fixed', laborDiscountValue: 0, includeVat: true, validityDays: 15, publicNotes: '', customerNotes: '',
};
const customers = [{ id: 'cu1', name: 'María López', phone: '6671112233', email: 'maria@correo.com', aliases: [] }];

// Backup file built with the app's own backup code
const { data } = installMemoryStorage();
data.set(STORAGE_KEYS.quotations, JSON.stringify([quotation]));
data.set(STORAGE_KEYS.customers, JSON.stringify(customers));
const backupPath = resolve(WORK, 'respaldo-prueba.json');
await writeFile(backupPath, serializeBackup(buildBackup(new Date('2026-11-06T12:00:00'))));
const xmlPath = resolve(WORK, 'factura-prueba.xml');
await writeFile(xmlPath, cfdiXml({ uuid: UUID_1 }).xml);
const pdfPath = resolve('tests/fixtures/pac-etiqueta-arriba.pdf'); // absolute: the browser process resolves paths, not node

const c = await connect(Number(process.env.CDP_PORT ?? 9224));
const steps = [];
const mark = (name) => { steps.push({ name, violations: c.violations.length }); };
const setFiles = async (selector, files) => {
  await c.waitFor(`Boolean(document.querySelector(${q(selector)}))`);
  const { root } = await c.send('DOM.getDocument');
  const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  await c.send('DOM.setFileInputFiles', { nodeId, files });
};
const importFile = async (file, rows) => {
  // setFileInputFiles can be lost if it lands while the page is still settling: retry once.
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(1200);
    await setFiles('[data-testid=xml-input]', [file]);
    for (let i = 0; i < 40; i++) {
      if (await c.evaluate(`document.querySelectorAll("[data-testid=invoice-row]").length >= ${rows}`)) return;
      await sleep(250);
    }
  }
  console.log('avisos:', await c.evaluate('[...document.querySelectorAll("[data-testid=toast]")].map((t) => t.innerText)'), 'hash:', await c.evaluate('location.hash'), 'dialogs:', await c.evaluate('document.querySelectorAll("dialog[open]").length'));
  throw new Error(`No se importó ${file}`);
};
const go = async (path) => { await c.evaluate(`location.hash = ${q(path)}`); await sleep(700); };
const key = (k, code, vk, modifiers = 0) => c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers }).then(() => c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }));

try {
  await c.send('Page.enable');
  await c.send('Page.navigate', { url: `${BASE}/#/` });
  await c.waitFor('document.readyState === "complete"');
  const existing = await c.evaluate(`localStorage.getItem(${q(STORAGE_KEYS.quotations)})`);
  assert.ok(existing === null || existing === '[]' || existing.includes('csp-1'), 'El perfil tiene datos reales: abortado sin tocar nada');
  await c.evaluate(`localStorage.setItem(${q(STORAGE_KEYS.quotations)}, ${q(JSON.stringify([quotation]))}); localStorage.setItem(${q(STORAGE_KEYS.customers)}, ${q(JSON.stringify(customers))}); localStorage.setItem(${q(STORAGE_KEYS.quotationFolio)}, '{"lastNumber":1}');`);
  await c.send('Page.navigate', { url: `${BASE}/?csp=${Date.now()}#/` });
  await sleep(1500);
  const hasTauri = await c.evaluate('Boolean(window.__TAURI__?.core?.invoke)');
  console.log('window.__TAURI__ presente:', hasTauri);
  await c.screenshot(`${WORK}/01-inicio.png`);
  mark('inicio y logo en pantalla');

  // Vista previa del PDF de la cotización (jsPDF, logo, fuentes, iframe blob:)
  await go('/historial');
  await c.waitFor('document.querySelectorAll("[data-testid=hi-row]").length > 0');
  await c.evaluate('document.querySelector("[data-testid=hi-row] button[aria-haspopup]").click()');
  await sleep(300);
  await c.evaluate('[...document.querySelectorAll("[role=menuitem]")].find((e) => e.textContent.includes("Ver cotización")).click()');
  await c.waitFor('Boolean(document.querySelector("dialog[open] iframe"))');
  await sleep(2500);
  const frame = await c.evaluate('document.querySelector("dialog[open] iframe").src.slice(0, 5)');
  console.log('iframe del PDF:', frame);
  await c.screenshot(`${WORK}/02-vista-previa-pdf.png`);
  mark('vista previa PDF de la cotización');
  await key('Escape', 'Escape', 27);
  await sleep(500);

  // Importar factura XML y PDF; ver el original con PDF.js (canvas bajo Tauri)
  await go('/facturas');
  await importFile(xmlPath, 1);
  mark('importar factura XML');
  await importFile(pdfPath, 2);
  await sleep(1500);
  console.log('facturas importadas:', await c.evaluate('document.querySelectorAll("[data-testid=invoice-row]").length'));
  await c.screenshot(`${WORK}/03-facturas.png`);
  mark('importar factura PDF (PDF.js + jsQR)');
  await c.evaluate('document.querySelector("[data-testid=view-original]")?.click()');
  await sleep(3000);
  await c.screenshot(`${WORK}/04-original.png`);
  mark('ver original (PDF.js en canvas)');
  await c.evaluate('document.querySelector("[data-testid=original-close]")?.click()');
  await sleep(400);

  // Paleta de búsqueda y respaldo
  await key('k', 'KeyK', 75, 2);
  await sleep(500);
  await c.fill('[data-testid=palette-input]', 'civic');
  await sleep(600);
  await c.screenshot(`${WORK}/05-paleta.png`);
  mark('paleta de búsqueda');
  await key('Escape', 'Escape', 27);
  await go('/respaldo');
  await setFiles('input[type=file][accept*=json]', [backupPath]);
  await sleep(1500);
  await c.screenshot(`${WORK}/06-respaldo-importar.png`);
  mark('importar respaldo (lectura y confirmación)');

  // Tema oscuro del sistema
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await go('/');
  await key('k', 'KeyK', 75, 2);
  await sleep(600);
  await c.screenshot(`${WORK}/07-tema-oscuro.png`);
  mark('tema oscuro');

  console.log(JSON.stringify(steps, null, 1));
  console.log(c.violations.length === 0 ? 'SIN violaciones de CSP' : 'VIOLACIONES DE CSP:\n' + [...new Set(c.violations)].join('\n'));
  console.log('Errores de excepción:', JSON.stringify(c.errors));
} catch (error) {
  console.log('FALLO EN EL FLUJO:', error.message);
  console.log('Pasos completados:', steps.map((s) => s.name).join(' | '));
  console.log('Violaciones de CSP hasta aquí:', [...new Set(c.violations)]);
  console.log('Excepciones:', JSON.stringify(c.errors));
  await c.screenshot(`${WORK}/fallo.png`).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await c.evaluate('localStorage.clear()').catch(() => undefined);
  c.close();
}
