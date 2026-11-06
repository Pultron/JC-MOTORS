import assert from 'node:assert/strict';
import { connect } from './cdpClient.mjs';

const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const c = await connect(Number(process.env.CDP_PORT ?? 9223));
await c.send('Page.bringToFront');
await c.send('Emulation.setFocusEmulationEnabled', { enabled: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const q = JSON.stringify;
const text = (selector) => c.evaluate(`document.querySelector(${q(selector)})?.innerText ?? null`);
const get = (key) => c.evaluate(`localStorage.getItem(${q(key)})`);
const open = async (hash) => { await c.send('Page.navigate', { url: `${BASE}/#${hash}` }); await c.send('Page.reload'); await sleep(600); await c.waitFor('Boolean(document.querySelector("nav"))'); };

const quotation = (n) => ({ id: `q-${n}`, folio: `JC-000${n}`, createdAt: new Date().toISOString(), status: 'Pendiente', customer: { name: `Cliente ${n}`, phone: '6671234567' }, vehicle: { make: 'Nissan', model: 'Sentra', plates: 'ABC' }, items: [{ id: `i${n}`, type: 'part', description: 'Filtro', quantity: 1, saleUnitPrice: 100, amount: 100 }], laborDiscountType: 'percentage', laborDiscountValue: 0, includeVat: true, subtotalNeto: 100, ivaAmount: 16, total: 116, validityDays: 3650, publicNotes: '', customerNotes: '' });

try {
  await c.send('Page.navigate', { url: `${BASE}/#/` });
  await c.waitFor('Boolean(document.querySelector("nav"))');

  // 1. Migración: instalación con claves anteriores → copia, marca, originales intactas
  const invoices = JSON.stringify([]);
  await c.evaluate(`localStorage.clear(); localStorage.setItem('jcmotors.invoices', ${q(invoices)}); localStorage.setItem('jcmotors.folioConsecutivo', '41'); localStorage.setItem('jc-motors-sidebar-theme', 'light'); localStorage.setItem('jc-motors:quotations:v1', ${q(JSON.stringify([quotation(1), quotation(2)]))});`);
  await open('/');
  assert.equal(await get('jc-motors:invoice-folio:v1'), '41');
  assert.equal(await get('jc-motors:invoices:v1'), invoices);
  assert.equal(await get('jc-motors:sidebar-theme:v1'), 'light');
  assert.equal(await get('jcmotors.folioConsecutivo'), '41', 'la clave anterior sigue como respaldo');
  assert.ok(JSON.parse(await get('jc-motors:meta:migration:v1')).date);
  await c.waitFor('document.body.innerText.includes("Cliente 1")');
  assert.equal(await c.evaluate('Boolean(document.querySelector("[data-testid=backup-reminder]"))'), true, 'hay datos y nunca hubo respaldo');

  // 2. Costos internos dañados: sin pantalla en blanco, lista vacía, respaldo del crudo y aviso
  await c.evaluate(`localStorage.setItem('jc-motors:internal-costs:v1', '{dañado #001')`);
  await open('/control-interno');
  assert.ok((await text('body')).length > 50, 'la app no queda en blanco');
  await c.waitFor('document.body.innerText.includes("estaban dañados")');
  const backupKey = await c.evaluate(`Object.keys(localStorage).find((k) => k.startsWith('jc-motors:backup:internal-costs:'))`);
  assert.ok(backupKey);
  assert.equal(await get(backupKey), '{dañado #001');
  await c.screenshot('tests/artifacts/respaldo-costos-danados.png');

  // 3. Pantalla Respaldo: entrada de menú, barra de almacenamiento y exportación
  await open('/respaldo');
  assert.equal(await c.evaluate('[...document.querySelectorAll(".sb-item")].some((a) => a.innerText.trim() === "Respaldo")'), true);
  assert.match(await text('[data-testid=storage-usage]'), /Almacenamiento: \d+\.\d MB de ~5\.0 MB/);
  assert.equal(await c.evaluate('document.querySelector("[data-testid=storage-usage]").dataset.level'), 'ok');
  assert.match(await text('[data-testid=backup-current]'), /2 cotizaciones/);
  assert.match(await text('[data-testid=backup-last]'), /Todavía no/);
  await c.screenshot('tests/artifacts/respaldo-pantalla.png');

  // 4. Archivo basura: mensaje claro y nada cambia
  const chooseFile = (content) => c.evaluate(`(() => { const input = document.querySelector('[data-testid=backup-file]'); const dt = new DataTransfer(); dt.items.add(new File([${q(content)}], 'respaldo.json')); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const before = await c.evaluate('JSON.stringify(Object.entries(localStorage).sort())');
  await chooseFile('esto no es un respaldo');
  await c.waitFor('document.body.innerText.includes("Archivo no válido")');
  assert.equal(await c.evaluate('JSON.stringify(Object.entries(localStorage).sort())'), before);

  // 5. Importar en modo Combinar: resumen, confirmación, copia previa, sin duplicar, reinicio
  const file = { app: 'jc-motors', schemaVersion: 1, exportedAt: new Date().toISOString(), claves: { 'jc-motors:quotations:v1': JSON.stringify([quotation(2), quotation(5)]), 'jc-motors:quotation-folio:v1': JSON.stringify({ lastNumber: 30 }) } };
  await chooseFile(JSON.stringify(file));
  await c.waitFor('Boolean(document.querySelector("[data-testid=backup-summary]"))');
  assert.match(await text('[data-testid=backup-summary]'), /2 cotizaciones/);
  await c.click('[data-testid=backup-import]');
  await c.waitFor('Boolean(document.querySelector("[data-testid=confirm-accept]"))');
  await c.click('[data-testid=confirm-accept]');
  await c.waitFor(`Object.keys(localStorage).some((k) => k.startsWith('jc-motors:backup:pre-import:'))`);
  await sleep(3200);
  await c.waitFor('Boolean(document.querySelector("nav"))');
  const ids = JSON.parse(await get('jc-motors:quotations:v1')).map((entry) => entry.id).sort();
  assert.deepEqual(ids, ['q-1', 'q-2', 'q-5'], 'combinar une por id sin duplicar');
  assert.equal(JSON.parse(await get('jc-motors:quotation-folio:v1')).lastNumber, 30);

  // 6. Reemplazar pide segunda confirmación y se puede cancelar sin cambios
  await open('/respaldo');
  await chooseFile(JSON.stringify({ ...file, claves: { 'jc-motors:quotations:v1': JSON.stringify([quotation(9)]) } }));
  await c.waitFor('Boolean(document.querySelector("[data-testid=backup-summary]"))');
  await c.click('[data-testid=backup-mode-replace]');
  await c.click('[data-testid=backup-import]');
  await c.waitFor('Boolean(document.querySelector("[data-testid=confirm-accept]"))');
  await c.click('[data-testid=confirm-accept]');
  await c.waitFor('document.querySelector("[data-testid=confirm-dialog] h2")?.innerText.includes("Reemplazar")');
  await c.click('[data-testid=confirm-cancel]');
  await sleep(500);
  assert.deepEqual(JSON.parse(await get('jc-motors:quotations:v1')).map((entry) => entry.id).sort(), ['q-1', 'q-2', 'q-5']);

  // 7. Barra en ámbar/rojo según el uso
  await c.evaluate(`localStorage.setItem('jc-motors:backup:relleno:1', 'x'.repeat(${Math.round(5 * 1024 * 1024 * 0.8)}))`);
  await open('/respaldo');
  assert.equal(await c.evaluate('document.querySelector("[data-testid=storage-usage]").dataset.level'), 'warning');
  await c.screenshot('tests/artifacts/respaldo-barra-ambar.png');
  await c.evaluate(`localStorage.setItem('jc-motors:backup:relleno:1', 'x'.repeat(${Math.round(5 * 1024 * 1024 * 0.95)}))`);
  await open('/respaldo');
  assert.equal(await c.evaluate('document.querySelector("[data-testid=storage-usage]").dataset.level'), 'danger');

  assert.deepEqual(c.errors, []);
  console.log('storageBrowser: ok');
} finally {
  await c.evaluate('localStorage.clear()').catch(() => undefined);
  c.close();
}
