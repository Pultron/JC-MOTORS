import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { connect } from './cdpClient.mjs';

// E2E del Lote 4. Requiere `npm run dev` (APP_URL) y un navegador con perfil AISLADO y
// --remote-debugging-port=CDP_PORT (9223 por defecto). Siembra datos de prueba y los borra al terminar.
const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const dir = 'tests/artifacts/busqueda';
await mkdir(dir, { recursive: true });

const KEYS = { quotations: 'jc-motors:quotations:v1', customers: 'jc-motors:customers:v1', invoices: 'jc-motors:invoices:v1', folio: 'jc-motors:quotation-folio:v1' };
const vehicles = [['Toyota', 'Hilux'], ['Honda', 'Civic'], ['Nissan', 'Versa'], ['Ford', 'Ranger']];
const quotations = Array.from({ length: 47 }, (_, i) => {
  const n = i + 1;
  const [make, model] = vehicles[i % vehicles.length];
  return {
    id: `e2e-${n}`, folio: `JC-${String(n).padStart(4, '0')}`, createdAt: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString(),
    customerId: `cu${i % 3}`,
    customer: { name: ['María López', 'Juan Pérez', 'Ana Beltrán'][i % 3], phone: ['6671112233', '6673518806', '6675559999'][i % 3], email: `c${n}@correo.com` },
    vehicle: { make, model, year: 2018, plates: `E2E${String(n).padStart(3, '0')}` },
    items: [{ id: `a${n}`, type: 'labor', description: 'Afinación', quantity: 1, saleUnitPrice: 1000, amount: 1000 }],
    laborDiscountType: 'fixed', laborDiscountValue: 0, includeVat: false, validityDays: 36500, publicNotes: '', customerNotes: '',
    status: n === 5 ? 'Pendiente' : 'Cancelada',
  };
});
const customers = [
  { id: 'cu0', name: 'María López', phone: '6671112233', email: 'maria@correo.com', aliases: [] },
  { id: 'cu1', name: 'Juan Pérez', phone: '6673518806', email: 'juan@correo.com', aliases: [] },
  { id: 'cu2', name: 'Ana Beltrán', phone: '6675559999', email: 'ana@correo.com', aliases: [] },
];
const UUID = '3F2A9C1E-1111-2222-3333-ABCDEF123456';
const invoices = [{
  folio: 42, uuid: UUID, serieCSD: '00001000000500000000', lugarExpedicion: '80000', fechaEmision: '2026-10-01T10:00:00', efectoComprobante: 'I', exportacion: '01', version: '4.0',
  moneda: 'MXN', formaPago: '01', metodoPago: 'PUE',
  emisor: { rfc: 'AAA010101AAA', nombre: 'Taller JC', regimenFiscal: '601' },
  receptor: { rfc: 'XAXX010101000', nombre: 'Refacciones Norte', regimenFiscal: '616', codigoPostal: '80000', usoCFDI: 'G03' },
  conceptos: [], impuestos: [], subtotal: '1000.00', totalImpuestosTrasladados: '160.00', totalImpuestosRetenidos: '0.00', total: '1160.00',
  timbre: { selloCFD: '', selloSAT: '', cadenaOriginal: '', rfcProvCertif: '', fechaCertificacion: '', noCertificadoSAT: '' },
  estado: 'timbrada', selloIncompleto: false, origen: 'xml', archivoOriginal: '', archivoTipo: 'xml', archivoNombre: 'x.xml', camposDudosos: [], confirmadosQr: [], revisadoPorUsuario: true, importadoEn: '2026-10-02T00:00:00Z',
}];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const c = await connect(Number(process.env.CDP_PORT ?? 9223));
const q = (s) => JSON.stringify(s);
const text = (s) => c.evaluate(`document.querySelector(${q(s)})?.innerText.trim() ?? null`);
const count = (s) => c.evaluate(`document.querySelectorAll(${q(s)}).length`);
const hash = () => c.evaluate('location.hash');
const key = (k, code, vk, modifiers = 0, type = 'keyDown') => c.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, modifiers });
const press = async (k, code, vk, modifiers = 0) => { await key(k, code, vk, modifiers, 'rawKeyDown'); await key(k, code, vk, modifiers, 'keyUp'); };
const go = async (path) => { await c.evaluate(`location.hash = ${q(path)}`); await sleep(500); };
const type = async (selector, value) => { await c.fill(selector, value); await sleep(400); };

try {
  await c.send('Page.enable');
  await c.send('Page.navigate', { url: `${BASE}/#/` });
  await c.waitFor('document.readyState === "complete"');
  const existing = await c.evaluate(`localStorage.getItem(${q(KEYS.quotations)})`);
  assert.ok(existing === null || existing === '[]' || existing.includes('e2e-'), 'El perfil tiene datos reales: abortado');
  await c.evaluate(`localStorage.setItem(${q(KEYS.quotations)}, ${q(JSON.stringify(quotations))}); localStorage.setItem(${q(KEYS.customers)}, ${q(JSON.stringify(customers))}); localStorage.setItem(${q(KEYS.invoices)}, ${q(JSON.stringify(invoices))}); localStorage.setItem(${q(KEYS.folio)}, '47');`);
  await c.send('Page.navigate', { url: `${BASE}/?t=${Date.now()}#/historial` });
  await c.waitFor('document.querySelectorAll("[data-testid=hi-row]").length > 0');

  // #027 paginación: 47 cotizaciones -> 20 / 20 / 7
  assert.equal(await count('[data-testid=hi-row]'), 20);
  assert.equal(await text('[data-testid=hi-page-range]'), '1–20 de 47');
  await c.screenshot(`${dir}/historial-paginacion.png`);
  await c.click('[data-testid=pagina-3]');
  await sleep(500);
  assert.equal(await count('[data-testid=hi-row]'), 7);
  assert.equal(await text('[data-testid=hi-page-range]'), '41–47 de 47');
  assert.match(await hash(), /p=3/);

  // #027 atrás desde una cotización vuelve al mismo lugar
  await c.evaluate('document.querySelector("[data-testid=hi-row] [data-testid^=hi-view-]").click()');
  await sleep(500);
  assert.match(await hash(), /#\/cotizaciones\//);
  await c.evaluate('history.back()');
  await sleep(600);
  assert.match(await hash(), /p=3/);
  assert.equal(await text('[data-testid=hi-page-range]'), '41–47 de 47');

  // #029 búsqueda por teléfono con formato + #027 reinicia a página 1 y se guarda en la URL
  await type('[data-testid=hi-search]', '(667) 351-8806');
  assert.match(await hash(), /q=/);
  assert.doesNotMatch(await hash(), /p=/);
  assert.equal(await text('[data-testid=hi-count]'), '16 resultados');
  // #028 en Inicio: misma consulta, mismos resultados
  await go('/');
  await c.waitFor('Boolean(document.querySelector("[data-testid=inicio-buscar]"))');
  await type('[data-testid=inicio-buscar]', '(667) 351-8806');
  assert.match(await text('[data-testid=inicio-conteo]'), /de 16 cotizaciones/);

  // #034 tres estados vacíos distintos
  await type('[data-testid=inicio-buscar]', 'zzzz');
  assert.match(await text('[data-testid=inicio-vacio]'), /Sin resultados para «zzzz»/);
  assert.match(await text('[data-testid=inicio-vacio]'), /Limpiar búsqueda/);
  await c.screenshot(`${dir}/vacio-busqueda.png`);
  await type('[data-testid=inicio-buscar]', '');
  await c.click('[data-testid=filtro-Aprobada]');
  await sleep(400);
  assert.match(await text('[data-testid=inicio-vacio]'), /No hay cotizaciones con estado Aprobada/);
  assert.match(await text('[data-testid=inicio-vacio]'), /Quitar filtro/);
  await c.screenshot(`${dir}/vacio-estado.png`);

  // M04 paleta
  await go('/historial');
  await press('k', 'KeyK', 75, 2); // Ctrl+K
  await c.waitFor('Boolean(document.querySelector("[data-testid=palette]"))');
  assert.equal(await c.evaluate('document.querySelector("[data-testid=palette]").getAttribute("aria-modal")'), 'true');
  assert.equal(await c.evaluate('document.querySelector("[data-testid=palette-input]").getAttribute("role")'), 'combobox');
  assert.match(await text('[data-testid=palette-empty]'), /Escribe para buscar en cotizaciones, clientes y facturas/);
  await c.screenshot(`${dir}/paleta-vacia.png`);
  await c.fill('[data-testid=palette-input]', 'civic');
  await sleep(500);
  assert.ok(await count('[data-testid=palette-option]') > 0);
  assert.equal(await c.evaluate('document.querySelector("[data-testid=palette-input]").getAttribute("aria-activedescendant")'), 'pal-opt-0');
  await press('ArrowDown', 'ArrowDown', 40);
  assert.equal(await c.evaluate('document.querySelector("[data-testid=palette-input]").getAttribute("aria-activedescendant")'), 'pal-opt-1');
  await c.screenshot(`${dir}/paleta-civic.png`);
  const second = await c.evaluate('document.querySelector("#pal-opt-1").dataset.key');
  await press('Enter', 'Enter', 13);
  await sleep(600);
  assert.equal(await hash(), `#/cotizaciones/${second.replace('quotation-', '')}`);

  // Esc cierra y el foco regresa
  await go('/clientes');
  await press('k', 'KeyK', 75, 2);
  await c.waitFor('Boolean(document.querySelector("[data-testid=palette]"))');
  await c.fill('[data-testid=palette-input]', '667 351');
  await sleep(500);
  await press('Tab', 'Tab', 9);
  assert.equal(await c.evaluate('Boolean(document.activeElement.closest("[data-testid=palette]"))'), true, 'Tab no debe salirse del modal');
  await press('Escape', 'Escape', 27);
  await sleep(300);
  assert.equal(await count('[data-testid=palette]'), 0);

  // Cliente por teléfono -> Clientes con ese cliente seleccionado
  await press('k', 'KeyK', 75, 2);
  await c.waitFor('Boolean(document.querySelector("[data-testid=palette]"))');
  await c.fill('[data-testid=palette-input]', '667 351');
  await sleep(500);
  await c.evaluate('document.querySelector("[data-key=customer-cu1]").click()');
  await sleep(700);
  assert.equal(await c.evaluate('document.querySelector("[data-testid=cli-row][data-id=cu1]") !== null'), true);

  // Factura por folio interno -> Facturas con esa factura seleccionada
  await press('k', 'KeyK', 75, 2);
  await c.waitFor('Boolean(document.querySelector("[data-testid=palette]"))');
  await c.fill('[data-testid=palette-input]', 'Nº 0042');
  await sleep(500);
  await c.screenshot(`${dir}/paleta-factura.png`);
  await c.evaluate(`document.querySelector("[data-key='invoice-${UUID}']").click()`);
  await sleep(900);
  assert.equal(await c.evaluate(`document.querySelector("[data-testid=invoice-row][data-uuid='${UUID}']")?.dataset.selected`), 'true');

  // "Ver todos" lleva a la pantalla con ?q=
  await press('k', 'KeyK', 75, 2);
  await c.waitFor('Boolean(document.querySelector("[data-testid=palette]"))');
  await c.fill('[data-testid=palette-input]', 'civic');
  await sleep(500);
  await c.click('[data-testid=palette-all-quotation]');
  await sleep(600);
  assert.match(await hash(), /#\/historial\?q=civic/);

  assert.deepEqual(c.errors, []);
  console.log('OK: busqueda E2E');
} finally {
  await c.evaluate(`[${q(KEYS.quotations)}, ${q(KEYS.customers)}, ${q(KEYS.invoices)}, ${q(KEYS.folio)}].forEach((k) => localStorage.removeItem(k))`).catch(() => undefined);
  c.close();
}
