// SCRIPT MANUAL de la app COMPILADA (no está en `npm test`). Verifica la migración a SQLite y el respaldo .jcm.
//
//   npm run tauri build
//   E2E_WORK=<carpeta temporal vacía> node tests/sqliteE2E.mjs [T1 T2 T3 T4 T5 T6 ...]
//
// Cada prueba usa un perfil de WebView2 y una carpeta de datos (JCM_DATA_DIR) PROPIOS dentro de E2E_WORK: nunca toca los
// datos reales. Los diálogos nativos «Guardar como» / «Abrir» se manejan con UI Automation (tests/sqliteDialog.ps1).
// Requiere Windows con sesión interactiva y la ventana de la app visible (SendKeys necesita el primer plano).
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { inflateRawSync, deflateRawSync, crc32 } from 'node:zlib';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { connect } from './cdpClient.mjs';

const EXE = resolve(process.env.APP_EXE ?? 'src-tauri/target/release/jc-motors-cotizador.exe');
const WORK = resolve(process.env.E2E_WORK ?? join(tmpdir(), 'jcm-e2e'));
const PORT = Number(process.env.CDP_PORT ?? 9224);
const SHOTS = resolve('docs/capturas-sqlite');
const PS1 = resolve('tests/sqliteDialog.ps1');
mkdirSync(WORK, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const K = (name) => `jc-motors:${name}:v1`;
const KEYS = { quotations: K('quotations'), customers: K('customers'), templates: K('templates'), internalControls: K('internal-controls'), internalCosts: K('internal-costs'), invoices: K('invoices'), invoiceFolio: K('invoice-folio'), quotationFolio: K('quotation-folio') };
const LISTS = ['quotations', 'customers', 'templates', 'internalControls', 'internalCosts', 'invoices'];

// ───────────────────────── datos de prueba tipo taller ─────────────────────────
function seed(quotationCount, tag = 'A') {
  const rnd = (() => { let s = quotationCount * 7919 + tag.charCodeAt(0); return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  const money = (n) => Math.round(n * 100) / 100;
  const quotations = Array.from({ length: quotationCount }, (_, index) => {
    const n = quotationCount - index;
    const items = Array.from({ length: 3 + Math.floor(rnd() * 6) }, (__, i) => {
      const quantity = 1 + Math.floor(rnd() * 4);
      const saleUnitPrice = money(80 + rnd() * 1900);
      return { id: `${tag}-q${n}-i${i}`, type: i === 0 ? 'labor' : 'part', description: `Concepto ${i + 1} de la cotización ${n}`, quantity, saleUnitPrice, amount: money(quantity * saleUnitPrice) };
    });
    const subtotalNeto = money(items.reduce((s, it) => s + it.amount, 0));
    const ivaAmount = money(subtotalNeto * 0.16);
    return {
      id: `${tag}-q${n}`, folio: `JC-${String(n).padStart(4, '0')}`, createdAt: new Date(Date.now() - (quotationCount - n + 1) * 86400000).toISOString(),
      customerId: `${tag}-c${(n % 12) + 1}`, customer: { name: `Cliente ${(n % 12) + 1}`, phone: `667${String(1000000 + n).slice(0, 7)}` },
      vehicle: { make: 'Nissan', model: 'Versa', year: 2018, plates: `AB${n}` }, items, laborDiscountType: 'percentage', laborDiscountValue: 0,
      includeVat: true, subtotalNeto, ivaAmount, total: money(subtotalNeto + ivaAmount), validityDays: 36500, publicNotes: '', customerNotes: '',
      status: n % 5 === 0 ? 'Aprobada' : 'Pendiente', ...(n % 5 === 0 ? { approvedAt: new Date().toISOString() } : {}),
    };
  });
  const customers = Array.from({ length: 12 }, (_, i) => ({ id: `${tag}-c${i + 1}`, name: `Cliente ${i + 1}`, phone: `667${String(2000000 + i)}`, email: `cliente${i + 1}@gmail.com`, aliases: i % 3 === 0 ? [`Alias ${i + 1}`] : [] }));
  const templates = Array.from({ length: 3 }, (_, i) => ({ id: `${tag}-t${i + 1}`, name: `Plantilla ${i + 1}`, items: [{ type: 'part', description: 'Filtro de aceite', quantity: 1, saleUnitPrice: 120 + i }] }));
  const internalCosts = quotations.slice(0, 5).map((q) => ({ id: `${tag}-ic-${q.id}`, quoteId: q.id, itemCosts: [], additionalExpenses: [], createdAt: q.createdAt, updatedAt: q.createdAt }));
  const internalControls = quotations.slice(0, 5).map((q) => ({ id: `${tag}-ctl-${q.id}`, quotationId: q.id, partCosts: [] }));
  const invoices = Array.from({ length: 8 }, (_, i) => {
    const pdf = i < 6;
    const bytes = pdf ? Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(Array.from({ length: 90_000 }, (__, j) => (j * (i + 3) + 11) % 256))]) : Buffer.from(`<?xml version="1.0"?><cfdi:Comprobante Total="${i}00.50"/>`);
    const total = `${(i + 1) * 1160}.${String((i * 37) % 100).padStart(2, '0')}`;
    return {
      folio: i + 1, uuid: `${tag}1a2b3c4d-0000-4000-8000-00000000000${i}`, serieCSD: '00001', lugarExpedicion: '80000', fechaEmision: '2026-10-01T10:00:00', efectoComprobante: 'I', exportacion: '01', version: '4.0', moneda: 'MXN',
      formaPago: '01', metodoPago: 'PUE', emisor: { rfc: 'AAA010101AAA', nombre: 'Emisor', regimenFiscal: '601' }, receptor: { rfc: 'XAXX010101000', nombre: 'Receptor', regimenFiscal: '616', codigoPostal: '80000', usoCFDI: 'G03' },
      conceptos: [], impuestos: [], subtotal: total, totalImpuestosTrasladados: '0.00', totalImpuestosRetenidos: '0.00', total, timbre: { selloCFD: '', selloSAT: '', cadenaOriginal: '', rfcProvCertif: '', fechaCertificacion: '', noCertificadoSAT: '' },
      estado: 'timbrada', selloIncompleto: false, origen: pdf ? 'pdf-adjunto' : 'xml', archivoOriginal: bytes.toString('base64'), archivoTipo: pdf ? 'pdf' : 'xml', archivoNombre: pdf ? `factura-${i}.pdf` : `factura-${i}.xml`, camposDudosos: [], confirmadosQr: [], revisadoPorUsuario: false, importadoEn: new Date().toISOString(), _bytes: bytes,
    };
  });
  const files = Object.fromEntries(invoices.map((inv) => [inv.uuid, sha(inv._bytes)]));
  invoices.forEach((inv) => delete inv._bytes);
  const highest = quotationCount;
  return {
    raw: {
      [KEYS.quotations]: JSON.stringify(quotations), [KEYS.customers]: JSON.stringify(customers), [KEYS.templates]: JSON.stringify(templates), [KEYS.internalControls]: JSON.stringify(internalControls),
      [KEYS.internalCosts]: JSON.stringify(internalCosts), [KEYS.invoices]: JSON.stringify(invoices), [KEYS.quotationFolio]: JSON.stringify({ lastNumber: highest + 5 }), [KEYS.invoiceFolio]: '10',
    },
    files, quotations, invoices, counters: { quotation: highest + 5, invoice: 10 },
    quotationCents: quotations.reduce((s, q) => s + Math.round(q.total * 100), 0), invoiceCents: invoices.reduce((s, i) => s + Math.round(Number(i.total) * 100), 0),
  };
}

// ───────────────────────── harness de la app ─────────────────────────
let current = null;
function env(name, extra = {}) {
  const profile = join(WORK, name, 'perfil'); const data = join(WORK, name, 'datos');
  mkdirSync(profile, { recursive: true });
  return { profile, data, env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, JCM_DATA_DIR: data, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`, ...extra } };
}
function kill() {
  if (!current) return;
  if (current.c?.violations?.length) console.log('   VIOLACIONES DE CSP:', [...new Set(current.c.violations)].join(' | '));
  try { execSync(`taskkill /PID ${current.proc.pid} /T /F`, { stdio: 'ignore' }); } catch { /* ya cerrada */ }
  current = null;
}
async function launch(name, extra = {}) {
  kill(); await sleep(1500);
  const cfg = env(name, extra);
  assert.ok(cfg.profile.startsWith(WORK) && cfg.data.startsWith(WORK), 'perfil y datos deben estar dentro de E2E_WORK');
  const proc = spawn(EXE, [], { env: cfg.env, stdio: 'ignore' });
  current = { proc, ...cfg };
  let c;
  for (let i = 0; i < 80 && !c; i++) { await sleep(500); try { c = await connect(PORT); } catch { /* aún arrancando */ } }
  assert.ok(c, 'La app no abrió el puerto de depuración');
  await c.send('Page.enable');
  await c.waitFor('document.readyState === "complete"');
  current.c = c;
  return c;
}
const settled = async (c) => { await c.waitFor('document.body && document.body.innerText.length > 20 && !/Cargando JC Motors/.test(document.body.innerText)'); await sleep(600); };
const inv = (c, cmd, args = {}) => c.evaluate(`window.__TAURI__.core.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const invSafe = (c, cmd, args = {}) => c.evaluate(`window.__TAURI__.core.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String(e) }))`);
const snapshot = (c) => inv(c, 'db_load_snapshot');
const waitToast = (c, re, ms = 20000) => c.waitFor(`[...document.querySelectorAll('[data-testid=toast]')].some((t) => ${re}.test(t.innerText))`).catch(() => { throw new Error(`No apareció el toast ${re}`); });
function dialog(title, path) {
  return new Promise((res) => { const p = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Title', title, '-Path', path], { stdio: 'inherit' }); p.on('exit', (code) => res(code)); });
}
const SAVE = 'Guardar respaldo de JC Motors'; const OPEN = 'Elegir respaldo de JC Motors';
async function seedLocalStorage(name, data) {
  const c = await launch(name);
  await settled(c);
  await c.evaluate(`localStorage.clear(); const d = ${JSON.stringify(data.raw)}; for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v); true`);
  // WebView2 vuelca localStorage a disco de forma diferida: matar el proceso de inmediato pierde lo sembrado.
  await sleep(6000);
  kill(); await sleep(1500);
}
function compareSnapshot(snap, data, label) {
  for (const list of LISTS) {
    const expected = JSON.parse(data.raw[KEYS[list]]);
    assert.deepStrictEqual(JSON.parse(snap[KEYS[list]] ?? '[]'), expected, `${label}: ${list} difiere`);
  }
  assert.equal(JSON.parse(snap[KEYS.quotationFolio]).lastNumber, data.counters.quotation, `${label}: contador de cotizaciones`);
  assert.equal(Number(snap[KEYS.invoiceFolio]), data.counters.invoice, `${label}: contador de facturas`);
  const qc = JSON.parse(snap[KEYS.quotations]).reduce((s, q) => s + Math.round(q.total * 100), 0);
  const ic = JSON.parse(snap[KEYS.invoices]).reduce((s, i) => s + Math.round(Number(i.total) * 100), 0);
  assert.equal(qc, data.quotationCents, `${label}: suma de cotizaciones (centavos)`);
  assert.equal(ic, data.invoiceCents, `${label}: suma de facturas (centavos)`);
}
function checkFiles(dataDir, data, label) {
  for (const [uuid, hash] of Object.entries(data.files)) {
    const inv = data.invoices.find((i) => i.uuid === uuid);
    const path = join(dataDir, 'facturas', `${uuid}.${inv.archivoTipo}`);
    assert.ok(existsSync(path), `${label}: falta ${path}`);
    assert.equal(sha(readFileSync(path)), hash, `${label}: hash distinto para ${uuid}`);
  }
}
const countFiles = (dir) => (existsSync(dir) ? readdirSync(dir).length : 0);

// ───────────────────────── zip mínimo para armar archivos de prueba ─────────────────────────
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16); const out = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(off + 10); const csize = buf.readUInt32LE(off + 20); const nlen = buf.readUInt16LE(off + 28); const xlen = buf.readUInt16LE(off + 30); const clen = buf.readUInt16LE(off + 32); const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    const lnlen = buf.readUInt16LE(lho + 26); const lxlen = buf.readUInt16LE(lho + 28); const start = lho + 30 + lnlen + lxlen;
    const raw = buf.subarray(start, start + csize);
    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    off += 46 + nlen + xlen + clen;
  }
  return out;
}
function writeZip(entries) {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name); const comp = deflateRawSync(data); const crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc >>> 0, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp); centrals.push(ch, nameBuf); offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ───────────────────────── pruebas ─────────────────────────
const results = [];
const tests = {};
const A = seed(40, 'A');
const exportPath = join(WORK, 'usb', 'Respaldo prueba.jcm');

tests.T1 = async () => {
  rmSync(join(WORK, 'T1'), { recursive: true, force: true });
  await seedLocalStorage('T1', A);
  const c = await launch('T1');
  await settled(c);
  assert.equal(await c.evaluate(`Boolean(document.querySelector('[data-testid=welcome]'))`), false, 'No debe salir la bienvenida: hay datos que migrar');
  const status = await inv(c, 'db_open');
  assert.equal(status.initialized, true); assert.equal(status.localMigrationDone, true);
  compareSnapshot(await snapshot(c), A, 'T1'); checkFiles(current.data, A, 'T1');
  const pre = readdirSync(join(current.data, 'respaldos-auto')).filter((f) => f.startsWith('pre-migracion-'));
  assert.equal(pre.length, 1, 'Falta el respaldo automático previo a la migración');
  for (const [k, v] of Object.entries(A.raw)) assert.equal(await c.evaluate(`localStorage.getItem(${JSON.stringify(k)})`), v, `localStorage cambió: ${k}`);
  await c.evaluate(`location.hash = '#/historial'`); await sleep(1200);
  const rows = await c.evaluate(`document.querySelectorAll('[data-testid=hi-row]').length`);
  assert.ok(rows > 0, 'El historial no muestra cotizaciones');
  const first = await c.evaluate(`document.querySelector('[data-testid=hi-row]').innerText`);
  assert.match(first, /JC-0040/, 'La cotización más reciente debe ser JC-0040');
  await c.evaluate(`location.hash = '#/facturas'`); await sleep(1200);
  await c.screenshot(join(SHOTS, '04-facturas-tras-migracion.png'));
  await c.evaluate(`location.hash = '#/respaldo'`); await sleep(1200);
  await c.screenshot(join(SHOTS, '02-pantalla-respaldo.png'));
  console.log(`   historial: ${rows} filas visibles; pre-migración: ${pre[0]}`);
};

tests.T2 = async () => {
  rmSync(join(WORK, 'T2'), { recursive: true, force: true });
  await seedLocalStorage('T2', A);
  const c = await launch('T2', { JCM_TEST_FAIL_MIGRATION: '1' });
  await settled(c);
  const status = await inv(c, 'db_open');
  assert.equal(status.initialized, false, 'La migración fallida no debe dejar la base marcada');
  await waitToast(c, /No se pudo actualizar el almacenamiento/i);
  for (const [k, v] of Object.entries(A.raw)) assert.equal(await c.evaluate(`localStorage.getItem(${JSON.stringify(k)})`), v, `localStorage cambió: ${k}`);
  const snap = await snapshot(c); assert.deepEqual(snap, {}, 'La base debe haber quedado vacía (ROLLBACK)');
  assert.equal(countFiles(join(current.data, 'facturas')), 0, 'Quedaron archivos de factura huérfanos');
  await c.evaluate(`location.hash = '#/historial'`); await sleep(1200);
  assert.ok(await c.evaluate(`document.querySelectorAll('[data-testid=hi-row]').length`) > 0, 'La app no muestra los datos de localStorage');
  await c.screenshot(join(SHOTS, '05-migracion-fallida-toast.png'));
  // Siguiente apertura SIN el gancho: vuelve a intentar y ahora sí migra.
  const c2 = await launch('T2'); await settled(c2);
  assert.equal((await inv(c2, 'db_open')).initialized, true, 'El reintento debe migrar');
  compareSnapshot(await snapshot(c2), A, 'T2 reintento');
};

tests.T3 = async () => {
  rmSync(join(WORK, 'T3'), { recursive: true, force: true }); rmSync(join(WORK, 'usb'), { recursive: true, force: true }); mkdirSync(join(WORK, 'usb'), { recursive: true });
  await seedLocalStorage('T3', A);
  let c = await launch('T3'); await settled(c);
  await c.evaluate(`location.hash = '#/respaldo'`); await sleep(1000);
  await c.click('[data-testid=backup-export]');
  assert.equal(await dialog(SAVE, exportPath), 0, 'No se pudo manejar el diálogo Guardar como');
  await waitToast(c, /Respaldo guardado/);
  assert.ok(existsSync(exportPath), 'No se creó el .jcm'); assert.ok(!readdirSync(join(WORK, 'usb')).some((f) => f.endsWith('.tmp')), 'Quedó un temporal');
  const zip = readZip(readFileSync(exportPath)); const manifest = JSON.parse(zip.get('manifest.json'));
  assert.equal(manifest.app, 'jc-motors'); assert.equal(manifest.counts.quotations, 40); assert.equal(manifest.counts.invoices, 8);
  for (const [name, hash] of Object.entries(manifest.files)) assert.equal(sha(zip.get(name)), hash, `hash del zip: ${name}`);
  await c.screenshot(join(SHOTS, '03-respaldo-exportado.png'));
  console.log(`   exportado: ${statSync(exportPath).size} bytes; manifest ${JSON.stringify(manifest.counts)}`);

  // PC nueva: sin carpeta de datos ni perfil.
  kill(); await sleep(1500); rmSync(join(WORK, 'T3'), { recursive: true, force: true });
  c = await launch('T3'); await settled(c);
  assert.equal(await c.evaluate(`Boolean(document.querySelector('[data-testid=welcome]'))`), true, 'Debe salir la bienvenida');
  await c.screenshot(join(SHOTS, '01-bienvenida.png'));
  await c.click('[data-testid=restore-start]');
  assert.equal(await dialog(OPEN, exportPath), 0, 'No se pudo manejar el diálogo Abrir');
  await c.waitFor(`Boolean(document.querySelector('[data-testid=restore-summary]'))`);
  const summary = await c.evaluate(`document.querySelector('[data-testid=restore-summary]').innerText`);
  assert.match(summary, /40 cotizaciones/); assert.match(summary, /8 facturas/); assert.match(summary, /12 clientes/);
  await c.screenshot(join(SHOTS, '06-resumen-restauracion.png'));
  await c.click('[data-testid=restore-apply]');
  await sleep(3500); c = (await connectAgain()); await settled(c);
  compareSnapshot(await snapshot(c), A, 'T3 restaurado'); checkFiles(current.data, A, 'T3 restaurado');
  await waitToast(c, /Respaldo restaurado: 40 cotizaciones, 12 clientes, 8 facturas/).catch(() => console.log('   (aviso: no se vio el toast de restauración; ver captura)'));
  await c.screenshot(join(SHOTS, '07-restaurado.png'));
  // Siguiente folio: crear una cotización por la UI y revisar su folio.
  await createQuotationViaUi(c);
  const quotations = JSON.parse((await snapshot(c))[KEYS.quotations]);
  assert.equal(quotations[0].folio, `JC-${String(A.counters.quotation + 1).padStart(4, '0')}`, 'El siguiente folio debe continuar el contador');
  console.log(`   siguiente folio: ${quotations[0].folio}`);
};
async function connectAgain() { for (let i = 0; i < 60; i++) { try { const c = await connect(PORT); current.c = c; return c; } catch { await sleep(500); } } throw new Error('sin CDP'); }
async function createQuotationViaUi(c) {
  const q = (s) => JSON.stringify(s);
  const fill = (sel, v) => c.evaluate(`(() => { const e = document.querySelector(${q(sel)}); e.focus(); const p = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(e, ${q(v)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await c.evaluate(`location.hash = '#/nueva-cotizacion'`); await sleep(1500);
  await fill('[data-testid=cliente-nombre]', 'Cliente Post Restauración'); await fill('[data-testid=cliente-telefono]', '6671112233');
  await fill('[data-testid=vehiculo-marca]', 'Toyota'); await fill('[data-testid=vehiculo-modelo]', 'Hilux'); await c.pick('[data-testid=vehiculo-anio]', 2019); await fill('[data-testid=vehiculo-placas]', 'XYZ-987-A');
  if (!(await c.evaluate(`Boolean(document.querySelector('[data-testid=refaccion-descripcion-0]'))`))) { await c.click('[data-testid=refaccion-agregar]'); await c.waitFor(`Boolean(document.querySelector('[data-testid=refaccion-descripcion-0]'))`); }
  await fill('[data-testid=refaccion-descripcion-0]', 'Balatas'); await fill('[data-testid=refaccion-cantidad-0]', '1'); await fill('[data-testid=refaccion-precio-0]', '500');
  await sleep(400);
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 });
  await sleep(2500);
}

tests.T4 = async () => {
  if (!existsSync(exportPath)) await tests.T3();
  const dir = join(WORK, 'malos'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const good = readFileSync(exportPath); const zip = readZip(good);
  writeFileSync(join(dir, 'danado.jcm'), Buffer.concat([good.subarray(0, Math.floor(good.length / 2)), Buffer.from('basura')]));
  const foreign = new Map([['manifest.json', Buffer.from(JSON.stringify({ app: 'otra-app', format: 'jcm', schemaVersion: 1 }))], ['jcmotors.db', Buffer.from('nada')]]);
  writeFileSync(join(dir, 'otra-app.jcm'), writeZip([...foreign]));
  const newer = new Map(zip); newer.set('manifest.json', Buffer.from(JSON.stringify({ ...JSON.parse(zip.get('manifest.json')), schemaVersion: 99 })));
  writeFileSync(join(dir, 'version-nueva.jcm'), writeZip([...newer]));
  const tampered = new Map(zip); const dbBytes = Buffer.from(zip.get('jcmotors.db')); dbBytes[dbBytes.length - 10] ^= 0xff; tampered.set('jcmotors.db', dbBytes);
  writeFileSync(join(dir, 'hash-alterado.jcm'), writeZip([...tampered]));
  rmSync(join(WORK, 'T4'), { recursive: true, force: true });
  const c = await launch('T4'); await settled(c);
  assert.equal(await c.evaluate(`Boolean(document.querySelector('[data-testid=welcome]'))`), true);
  const expectations = { 'danado.jcm': /./, 'otra-app.jcm': /no es un respaldo de JC Motors/i, 'version-nueva.jcm': /versión más nueva/i, 'hash-alterado.jcm': /./ };
  for (const [file, re] of Object.entries(expectations)) {
    await c.click('[data-testid=restore-start]');
    assert.equal(await dialog(OPEN, join(dir, file)), 0);
    await c.waitFor(`Boolean(document.querySelector('[data-testid=restore-error]'))`);
    const msg = await c.evaluate(`document.querySelector('[data-testid=restore-error]').innerText`);
    assert.match(msg, re, `${file}: ${msg}`); assert.match(msg, /No se cambió ningún dato|quedaron como estaban/i);
    assert.equal(await c.evaluate(`Boolean(document.querySelector('[data-testid=restore-summary]'))`), false, `${file} no debe llegar al resumen`);
    console.log(`   ${file}: «${msg}»`);
    assert.deepEqual(await snapshot(c), {}, `${file} tocó la base`);
    assert.equal(countFiles(join(current.data, 'facturas')), 0);
    assert.ok(!readdirSync(current.data).some((n) => n.startsWith('tmp-restore')), `${file} dejó carpeta temporal`);
  }
  await c.screenshot(join(SHOTS, '08-archivo-rechazado.png'));
};

tests.T5 = async () => {
  if (!existsSync(exportPath)) await tests.T3();
  const B = seed(7, 'B');
  rmSync(join(WORK, 'T5'), { recursive: true, force: true });
  await seedLocalStorage('T5', B);
  let c = await launch('T5', { JCM_TEST_FAIL_RESTORE: '1' }); await settled(c);
  const before = await snapshot(c); compareSnapshot(before, B, 'T5 antes'); checkFiles(current.data, B, 'T5 antes');
  await c.evaluate(`location.hash = '#/respaldo'`); await sleep(1200);
  await c.click('[data-testid=restore-start]');
  assert.equal(await dialog(OPEN, exportPath), 0);
  await c.waitFor(`Boolean(document.querySelector('[data-testid=restore-summary]'))`);
  await c.click('[data-testid=restore-apply]'); await sleep(500);
  await c.click('[data-testid=restore-apply]');
  await c.waitFor(`Boolean(document.querySelector('[data-testid=restore-error]'))`);
  console.log(`   error mostrado: «${await c.evaluate(`document.querySelector('[data-testid=restore-error]').innerText`)}»`);
  await c.screenshot(join(SHOTS, '09-restauracion-fallida.png'));
  compareSnapshot(await snapshot(c), B, 'T5 tras fallo'); checkFiles(current.data, B, 'T5 tras fallo');
  assert.ok(!existsSync(join(current.data, 'jcmotors.db.old')) && !existsSync(join(current.data, 'jcmotors.db.new')), 'Quedaron .old/.new');
  const prePrev = readdirSync(join(current.data, 'respaldos-auto')).filter((f) => f.startsWith('pre-restauracion-'));
  console.log(`   copias pre-restauración: ${prePrev.length}`);
  // Reintento sin el gancho: ahora sí restaura y conserva copia previa.
  c = await launch('T5'); await settled(c);
  await c.evaluate(`location.hash = '#/respaldo'`); await sleep(1200);
  await c.click('[data-testid=restore-start]'); assert.equal(await dialog(OPEN, exportPath), 0);
  await c.waitFor(`Boolean(document.querySelector('[data-testid=restore-summary]'))`);
  await c.click('[data-testid=restore-apply]'); await sleep(500); await c.click('[data-testid=restore-apply]');
  await sleep(3500); c = await connectAgain(); await settled(c);
  const snap = await snapshot(c);
  assert.equal(JSON.parse(snap[KEYS.quotations]).length, 40);
  assert.equal(JSON.parse(snap[KEYS.quotationFolio]).lastNumber, Math.max(A.counters.quotation, B.counters.quotation), 'El contador no debe bajar');
  assert.ok(readdirSync(join(current.data, 'respaldos-auto')).some((f) => f.startsWith('pre-restauracion-')), 'Falta la copia previa a restaurar');
};

tests.T6 = async () => {
  const file = join(WORK, 'usb', 'lote1.json');
  mkdirSync(join(WORK, 'usb'), { recursive: true });
  writeFileSync(file, JSON.stringify({ app: 'jc-motors', schemaVersion: 1, exportedAt: new Date().toISOString(), claves: A.raw }, null, 2));
  rmSync(join(WORK, 'T6'), { recursive: true, force: true });
  let c = await launch('T6'); await settled(c);
  await c.click('[data-testid=restore-start]'); assert.equal(await dialog(OPEN, file), 0);
  await c.waitFor(`Boolean(document.querySelector('[data-testid=restore-summary]'))`);
  assert.match(await c.evaluate(`document.querySelector('[data-testid=restore-summary]').innerText`), /40 cotizaciones/);
  await c.click('[data-testid=restore-apply]'); await sleep(3500); c = await connectAgain(); await settled(c);
  compareSnapshot(await snapshot(c), A, 'T6'); checkFiles(current.data, A, 'T6');
};

const wanted = process.argv.slice(2);
const order = wanted.length ? wanted : ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
for (const name of order) {
  const started = Date.now();
  try { console.log(`▶ ${name}`); await tests[name](); results.push([name, 'OK', Date.now() - started]); console.log(`✔ ${name}`); }
  catch (error) { results.push([name, `FALLÓ: ${error.message.split('\n')[0]}`, Date.now() - started]); console.error(`✘ ${name}:`, error); }
  finally { kill(); await sleep(1000); }
}
console.log('\nResumen:'); for (const [n, r, ms] of results) console.log(` ${n}: ${r} (${Math.round(ms / 1000)} s)`);
process.exit(results.every(([, r]) => r === 'OK') ? 0 : 1);
