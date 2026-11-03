import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { connect } from './cdpClient.mjs';
import { UUID_1, UUID_8, UUID_C, UUID_D, UUID_E, UUID_F, UUID_G, cfdiXml } from './facturasFixtures.mjs';

// Requiere `npm run dev` (APP_URL) y un navegador con --remote-debugging-port=CDP_PORT (9223 por defecto).
const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const dir = resolve('tests/artifacts/facturas');
await mkdir(dir, { recursive: true });

const one = cfdiXml({ uuid: UUID_1, conceptos: 1 });
const eight = cfdiXml({ uuid: UUID_8, conceptos: 8 });
const third = cfdiXml({ uuid: UUID_C, conceptos: 2, receptor: 'Autopartes Sinaloa S.A. de C.V.' });
const extra = Object.fromEntries([['d', UUID_D], ['e', UUID_E], ['f', UUID_F], ['g', UUID_G]].map(([k, uuid]) => [k, cfdiXml({ uuid, conceptos: 1, receptor: `Cliente ${k.toUpperCase()}` })]));
const paths = Object.fromEntries(['one.xml', 'eight.xml', 'third.xml', 'd.xml', 'e.xml', 'f.xml', 'g.xml', 'bad.xml', 'eight-adjunto.pdf', 'third-sin-adjunto.pdf', 'escaneado.pdf'].map((n) => [n, resolve(dir, n)]));
await writeFile(paths['one.xml'], one.xml);
await writeFile(paths['eight.xml'], eight.xml);
await writeFile(paths['third.xml'], third.xml);
for (const k of ['d', 'e', 'f', 'g']) await writeFile(paths[`${k}.xml`], extra[k].xml);
await writeFile(paths['bad.xml'], '<html><body>esto no es un CFDI</body></html>');

const pad = (n) => String(n).padStart(4, '0');
const SELLO_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const c = await connect(Number(process.env.CDP_PORT ?? 9223));
try {
  await c.send('DOM.enable');
  const upload = async (file) => {
    const { root } = await c.send('DOM.getDocument');
    const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-testid="xml-input"]' });
    await c.send('DOM.setFileInputFiles', { files: [file], nodeId });
  };
  const rows = () => c.evaluate('document.querySelectorAll("[data-testid=invoice-row]").length');
  const rowFor = (uuid) => `[data-testid=invoice-row][data-uuid="${uuid}"]`;
  const contador = () => c.evaluate('Number(localStorage.getItem("jcmotors.folioConsecutivo") || 0)');
  const stored = (uuid) => c.evaluate(`(() => { const i = JSON.parse(localStorage.getItem('jcmotors.invoices') || '[]').find((x) => x.uuid === ${JSON.stringify(uuid)}); return i && { folio: i.folio, origen: i.origen, selloIncompleto: i.selloIncompleto, dudosos: i.camposDudosos.length, selloCFD: i.timbre.selloCFD, selloSAT: i.timbre.selloSAT, cadena: i.timbre.cadenaOriginal, total: i.total, emisor: i.emisor, receptor: i.receptor, uuid: i.uuid, urlQrOriginal: i.urlQrOriginal, archivoTipo: i.archivoTipo }; })()`);
  const reset = async () => { await c.evaluate('localStorage.removeItem("jcmotors.invoices"); localStorage.removeItem("jcmotors.folioConsecutivo"); location.reload()'); await c.waitFor('Boolean(document.querySelector("[data-testid=xml-input]"))'); };
  const importar = async (file, uuid) => { await upload(file); await c.waitFor(`Boolean(document.querySelector('${rowFor(uuid)}'))`); };
  /** PDF generado por la app a partir de una factura guardada (se usa como "PDF de entrada"). */
  const pdfDe = (uuid) => c.evaluate(`(async () => {
    const { generarFacturaPdf } = await import('/src/services/invoicePdf.ts');
    const invoice = JSON.parse(localStorage.getItem('jcmotors.invoices')).find((i) => i.uuid === ${JSON.stringify(uuid)});
    const { file, pages, trace, nombre } = await generarFacturaPdf(invoice);
    const buf = new Uint8Array(await file.arrayBuffer()); let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { b64: btoa(s), pages, trace, name: file.name, nombre };
  })()`);
  const sealsOf = (trace) => {
    const seals = { cfd: '', sat: '', cad: '' };
    const pages = { cfd: new Set(), sat: new Set(), cad: new Set() };
    let current = null;
    for (const { page, text } of trace) {
      if (text.startsWith('Sello digital del CFDI')) current = 'cfd';
      else if (text.startsWith('Sello digital del SAT')) current = 'sat';
      else if (text.startsWith('Cadena original')) current = 'cad';
      else if (text.startsWith('RFC del proveedor') || text.startsWith('Este documento') || text.startsWith('Página ')) current = null;
      else if (current) { seals[current] += text; pages[current].add(page); }
    }
    return { seals, pages };
  };
  const hayConfirmacion = 'Boolean(document.querySelector("[data-testid=confirm-card], [data-testid=confirm-dialog], dialog[open]"))';

  if (!process.env.TAURI_TEST) await c.send('Page.navigate', { url: `${BASE}/#/facturas` });
  await c.waitFor('Boolean(document.querySelector("[data-testid=facturas-page]"))');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1586, height: 992, deviceScaleFactor: 1, mobile: false });
  await reset();
  assert.match(await c.evaluate('document.body.innerText'), /Sube un PDF o un XML/);

  // ---- Preparación: PDFs de entrada generados a partir de las facturas B (con XML adjunto) y C (sin adjunto)
  await importar(paths['eight.xml'], UUID_8);
  await importar(paths['third.xml'], UUID_C);
  const pdfEight = await pdfDe(UUID_8);
  const pdfThird = await pdfDe(UUID_C);
  const adjunto = await PDFDocument.load(Buffer.from(pdfEight.b64, 'base64'));
  await adjunto.attach(Buffer.from(eight.xml, 'utf8'), 'factura.xml', { mimeType: 'application/xml' });
  await writeFile(paths['eight-adjunto.pdf'], await adjunto.save());
  await writeFile(paths['third-sin-adjunto.pdf'], Buffer.from(pdfThird.b64, 'base64'));
  const escaneado = await PDFDocument.create();
  escaneado.addPage([595, 842]).drawRectangle({ x: 40, y: 40, width: 500, height: 700 });
  await writeFile(paths['escaneado.pdf'], await escaneado.save());
  await reset();
  assert.equal(await contador(), 0);

  // ---- 1. XML: fila, toast y NINGUNA pantalla de confirmación
  await upload(paths['one.xml']);
  await c.waitFor(`Boolean(document.querySelector('${rowFor(UUID_1)}'))`);
  await c.waitFor('Boolean(document.querySelector("[data-testid=toast]"))');
  assert.match(await c.evaluate('document.querySelector("[data-testid=toast]").innerText'), /Factura Num - 0001 lista/);
  assert.equal(await c.evaluate(hayConfirmacion), false);
  const xml1 = await stored(UUID_1);
  assert.equal(xml1.origen, 'xml');
  assert.equal(xml1.folio, 1);
  assert.equal(xml1.selloIncompleto, false);
  assert.equal(await c.evaluate('document.querySelector("[data-testid=seal-cfd]").textContent'), one.selloCFD);
  assert.equal(await c.evaluate('document.querySelector("[data-testid=invoice-folio]").textContent'), '0001');
  assert.equal(await c.evaluate('document.querySelectorAll("[data-testid=row-sello-dot], [data-testid=doubt-banner]").length'), 0, 'sello correcto: la interfaz no muestra nada');

  // ---- 2. PDF con XML adjunto: igual, sin confirmación
  await importar(paths['eight-adjunto.pdf'], UUID_8);
  assert.equal(await c.evaluate(hayConfirmacion), false);
  const adj = await stored(UUID_8);
  assert.equal(adj.origen, 'pdf-adjunto');
  assert.equal(adj.archivoTipo, 'pdf');
  assert.equal(adj.selloCFD, eight.selloCFD);
  assert.equal(adj.folio, 2);

  // ---- 3 y 4. PDF sin adjunto (capa de texto + QR): UUID, RFC, sellos de 344 y total = tt del QR
  await upload(paths['third-sin-adjunto.pdf']);
  await c.waitFor(`Boolean(document.querySelector('${rowFor(UUID_C)}'))`);
  assert.equal(await c.evaluate(hayConfirmacion), false, 'sin pantalla de confirmación');
  const txt = await stored(UUID_C);
  assert.equal(txt.origen, 'pdf-texto');
  assert.equal(txt.folio, 3);
  assert.equal(txt.uuid, UUID_C);
  assert.equal(txt.emisor.rfc, 'LAVJ800101AB1');
  assert.equal(txt.receptor.rfc, 'AAA010101AAA');
  for (const sello of [txt.selloCFD, txt.selloSAT]) {
    assert.equal(sello.length, 344);
    assert.match(sello, SELLO_RE);
  }
  assert.equal(txt.selloCFD, third.selloCFD);
  assert.equal(txt.selloSAT, third.selloSAT);
  assert.equal(txt.cadena, third.cadenaOriginal);
  assert.equal(txt.selloIncompleto, false);
  assert.equal(txt.total, third.total);
  assert.equal(new URL(txt.urlQrOriginal).searchParams.get('tt'), txt.total, 'el total coincide con el tt del QR');
  assert.ok(txt.urlQrOriginal.includes(`id=${UUID_C}`), 'se conserva la URL del QR original');
  assert.equal(txt.emisor.regimenFiscal, '626');
  assert.equal(txt.receptor.regimenFiscal, '601');
  assert.equal(txt.emisor.nombre, 'Juan Carlos Lara Vidaño');
  assert.equal(txt.receptor.nombre, 'Autopartes Sinaloa S.A. de C.V.');
  assert.equal(txt.dudosos, 0, 'la extracción de un PDF propio no debe dejar dudas');

  // ---- 9. PDF escaneado: mensaje de error, nada se guarda, no se consume folio
  const antes = await rows();
  await upload(paths['escaneado.pdf']);
  await c.waitFor('document.body.innerText.includes("no tiene texto seleccionable")');
  assert.match(await c.evaluate('document.body.innerText'), /Sube el XML de la factura/);
  assert.equal(await rows(), antes);
  assert.equal(await contador(), 3, 'el PDF escaneado no consume folio');

  // XML inválido: tampoco consume folio
  await upload(paths['bad.xml']);
  await c.waitFor('document.body.innerText.includes("No se pudo importar la factura")');
  assert.equal(await contador(), 3);

  // ---- 10. La misma factura dos veces: no se duplica y no consume folio
  await upload(paths['one.xml']);
  await c.waitFor('document.body.innerText.includes("Factura ya importada")');
  await upload(paths['third-sin-adjunto.pdf']);
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(await rows(), antes);
  assert.equal(await c.evaluate('JSON.parse(localStorage.getItem("jcmotors.invoices")).length'), 3);
  assert.equal(await contador(), 3, 'un duplicado no consume folio');

  // ---- 5. Folios consecutivos; el contador no retrocede al borrar
  await importar(paths['d.xml'], UUID_D);
  await importar(paths['e.xml'], UUID_E);
  await importar(paths['f.xml'], UUID_F);
  const folios = [];
  for (const u of [UUID_D, UUID_E, UUID_F]) folios.push((await stored(u)).folio);
  assert.deepEqual(folios, [4, 5, 6], 'folios consecutivos');
  await c.click(rowFor(UUID_E));
  await c.waitFor('Boolean(document.querySelector("[data-testid=delete-invoice]"))');
  await c.click('[data-testid=delete-invoice]');
  await c.waitFor('Boolean(document.querySelector("[data-testid=confirm-dialog]"))');
  await c.click('[data-testid=confirm-accept]');
  await c.waitFor(`!document.querySelector('${rowFor(UUID_E)}')`);
  await importar(paths['g.xml'], UUID_G);
  const g = await stored(UUID_G);
  assert.equal(g.folio, 7, 'la nueva factura no reutiliza el folio borrado (5)');
  assert.equal(await contador(), 7);

  // ---- 6, 7 y 8. PDF generado: nombre con folio, pie "Página N de M", sellos completos e idénticos
  for (const [uuid, fixture, minPages] of [[UUID_1, one, 1], [UUID_8, eight, 2], [UUID_C, third, 1]]) {
    const result = await pdfDe(uuid);
    const folio = (await stored(uuid)).folio;
    assert.equal(result.name, `Factura Num - ${pad(folio)}.pdf`, 'nombre de archivo con el folio a cuatro dígitos');
    assert.ok(result.pages >= minPages, `${uuid}: ${result.pages} páginas`);
    for (let page = 1; page <= result.pages; page++) {
      assert.ok(result.trace.some((t) => t.page === page && t.text === `Página ${page} de ${result.pages}`), `pie de la página ${page}`);
    }
    assert.ok(result.trace.some((t) => t.text === pad(folio)), 'el folio interno aparece en el documento');
    const { seals, pages } = sealsOf(result.trace);
    assert.equal(seals.cfd, fixture.selloCFD, 'sello CFDI idéntico al original');
    assert.equal(seals.sat, fixture.selloSAT, 'sello SAT idéntico al original');
    assert.equal(seals.cad, fixture.cadenaOriginal, 'cadena original idéntica');
    console.log(`${uuid.slice(0, 8)}: ${result.pages} pág., sellos en`, Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, [...v]])));
  }

  // ---- PDFs reales de dos PAC con diseños distintos: todo se lee sin confirmación y sin dudas por campo
  const completa = (uuid) => c.evaluate(`(() => { const i = JSON.parse(localStorage.getItem('jcmotors.invoices') || '[]').find((x) => x.uuid === ${JSON.stringify(uuid)}); if (i) delete i.archivoOriginal; return i; })()`);
  const num = (valor) => Number(valor);
  const verificarSellos = (inv) => {
    for (const sello of [inv.timbre.selloCFD, inv.timbre.selloSAT]) {
      assert.equal(sello.length, 344, 'sello de 344 caracteres');
      assert.match(sello, SELLO_RE, 'sello base64 válido, sin ":" ni espacios');
    }
    assert.equal(inv.selloIncompleto, false);
    assert.ok(inv.timbre.cadenaOriginal.startsWith('||1.1|') && inv.timbre.cadenaOriginal.endsWith('||'));
    assert.ok(inv.timbre.cadenaOriginal.includes(inv.timbre.selloCFD), 'la cadena lleva el sello CFDI completo');
    assert.equal(new URL(inv.urlQrOriginal).searchParams.get('id').toUpperCase(), inv.uuid, 'QR leído y coincide con el folio fiscal');
    assert.equal(num(new URL(inv.urlQrOriginal).searchParams.get('tt')), num(inv.total), 'el total coincide con el tt del QR');
  };
  const antesReales = await contador();

  // PAC 1: encabezado "Etiqueta: valor" en dos columnas, etiquetas partidas en dos renglones, valores como nombres
  const UUID_PAC1 = 'ED522385-2C5B-4831-B5A6-D043F8054375';
  await upload(resolve('tests/fixtures/pac-sat-dos-columnas.pdf'));
  await c.waitFor(`Boolean(document.querySelector('${rowFor(UUID_PAC1)}'))`);
  assert.equal(await c.evaluate(hayConfirmacion), false, 'sin pantalla de confirmación');
  const pac1 = await completa(UUID_PAC1);
  assert.equal(pac1.origen, 'pdf-texto');
  assert.equal(pac1.folio, antesReales + 1);
  assert.equal(pac1.emisor.rfc, 'LAVJ030214Q21');
  assert.equal(pac1.emisor.nombre, 'JUAN CARLOS LARA VIDAÑO', 'el nombre no absorbe la etiqueta de la columna de al lado');
  assert.equal(pac1.emisor.regimenFiscal, '626');
  assert.equal(pac1.receptor.rfc, 'MME141128EY7');
  assert.equal(pac1.receptor.nombre, 'MEGANIS MECANIZACION');
  assert.equal(pac1.receptor.codigoPostal, '80199');
  assert.equal(pac1.receptor.regimenFiscal, '601');
  assert.equal(pac1.receptor.usoCFDI, 'G03');
  assert.equal(pac1.serieCSD, '00001000000727699276');
  assert.equal(pac1.lugarExpedicion, '80120');
  assert.equal(pac1.fechaEmision, '2026-10-16T11:14:51');
  assert.equal(pac1.efectoComprobante, 'I');
  assert.equal(pac1.exportacion, '01');
  assert.equal(pac1.moneda, 'MXN');
  assert.equal(pac1.formaPago, '03');
  assert.equal(pac1.metodoPago, 'PUE');
  assert.equal(pac1.conceptos.length, 1);
  assert.deepEqual(
    { ...pac1.conceptos[0], valorUnitario: num(pac1.conceptos[0].valorUnitario), importe: num(pac1.conceptos[0].importe) },
    { claveProdServ: '78181507', noIdentificacion: '', cantidad: '1', claveUnidad: 'E48', unidad: 'Unidad de servicio', descripcion: 'REPARACION DE MOTOR DE MONTACARGAS Y SISTEMA DE ENFRIAMIENTO', valorUnitario: 21568, importe: 21568, descuento: '', objetoImp: '02' },
  );
  assert.equal(pac1.impuestos.length, 1);
  assert.deepEqual({ ...pac1.impuestos[0], base: num(pac1.impuestos[0].base), importe: num(pac1.impuestos[0].importe) }, { impuesto: '002', tipo: 'Traslado', base: 21568, tipoFactor: 'Tasa', tasaOCuota: '0.160000', importe: 3450.88 });
  assert.equal(num(pac1.subtotal), 21568);
  assert.equal(num(pac1.totalImpuestosTrasladados), 3450.88);
  assert.equal(num(pac1.total), 25018.88);
  assert.equal(pac1.timbre.rfcProvCertif, 'SAT970701NN3');
  assert.equal(pac1.timbre.fechaCertificacion, '2026-10-16T11:16:45');
  assert.equal(pac1.timbre.noCertificadoSAT, '00001000000705250068');
  verificarSellos(pac1);
  assert.deepEqual(pac1.camposDudosos, [], 'ninguna duda: todo se leyó y se confirmó con el QR');

  // PAC 2: etiqueta arriba / valor abajo (centrado), nombres sin etiqueta, "CLAVE - Descripción", una fila por concepto
  const UUID_PAC2 = 'CA576F46-EF34-4C8F-96C1-F5E938EFFDF1';
  await upload(resolve('tests/fixtures/pac-etiqueta-arriba.pdf'));
  await c.waitFor(`Boolean(document.querySelector('${rowFor(UUID_PAC2)}'))`);
  assert.equal(await c.evaluate(hayConfirmacion), false, 'sin pantalla de confirmación');
  const pac2 = await completa(UUID_PAC2);
  assert.equal(pac2.folio, antesReales + 2);
  assert.equal(pac2.emisor.rfc, 'LIDV970203UB4');
  assert.equal(pac2.emisor.nombre, 'VICTOR JESUS LIZARRAGA DAVILA');
  assert.equal(pac2.emisor.regimenFiscal, '626');
  assert.equal(pac2.receptor.rfc, 'LAVJ030214Q21');
  assert.equal(pac2.receptor.nombre, 'JUAN CARLOS LARA VIDAÑO');
  assert.equal(pac2.receptor.codigoPostal, '80120');
  assert.equal(pac2.receptor.regimenFiscal, '626');
  assert.equal(pac2.receptor.usoCFDI, 'G03');
  assert.equal(pac2.serieCSD, '00001000000710150927');
  assert.equal(pac2.lugarExpedicion, '80220');
  assert.equal(pac2.fechaEmision, '2026-10-14T16:48:33');
  assert.equal(pac2.efectoComprobante, 'I');
  assert.equal(pac2.formaPago, '03');
  assert.equal(pac2.metodoPago, 'PUE');
  assert.equal(pac2.moneda, 'MXN');
  assert.equal(pac2.conceptos.length, 1);
  assert.equal(pac2.conceptos[0].claveProdServ, '78181507');
  assert.equal(pac2.conceptos[0].claveUnidad, 'E48');
  assert.equal(pac2.conceptos[0].descripcion, 'CEPILLADO DE CABEZA MONTACARGA');
  assert.equal(num(pac2.conceptos[0].cantidad), 1);
  assert.equal(num(pac2.conceptos[0].valorUnitario), 550);
  assert.equal(num(pac2.conceptos[0].importe), 550);
  assert.equal(pac2.conceptos[0].objetoImp, '02');
  assert.equal(pac2.impuestos.length, 1);
  assert.equal(pac2.impuestos[0].impuesto, '002');
  assert.equal(pac2.impuestos[0].tasaOCuota, '0.160000');
  assert.equal(num(pac2.impuestos[0].importe), 88);
  assert.equal(num(pac2.subtotal), 550);
  assert.equal(num(pac2.total), 638);
  assert.equal(pac2.timbre.rfcProvCertif, 'STA0903206B9');
  assert.equal(pac2.timbre.fechaCertificacion, '2026-10-14T18:00:12');
  assert.equal(pac2.timbre.noCertificadoSAT, '00001000000711762511');
  verificarSellos(pac2);
  assert.deepEqual(pac2.camposDudosos, []);

  // El PDF generado de la factura real lleva los datos (no queda ninguna celda vacía) y los sellos idénticos
  for (const [uuid, original] of [[UUID_PAC1, pac1], [UUID_PAC2, pac2]]) {
    const generado = await pdfDe(uuid);
    const junto = generado.trace.map((t) => t.text).join(' ').replace(/\s+/g, ' ');
    for (const dato of [original.receptor.codigoPostal, original.conceptos[0].descripcion, original.conceptos[0].claveProdServ, original.emisor.nombre, original.receptor.nombre]) {
      assert.ok(junto.includes(dato), `el PDF generado contiene "${dato}"`);
    }
    assert.ok(junto.includes('Pago en una sola exhibición'), 'método de pago con su descripción');
    assert.ok(junto.includes('Gastos en general'), 'uso CFDI con su descripción');
    const { seals } = sealsOf(generado.trace);
    assert.equal(seals.cfd, original.timbre.selloCFD);
    assert.equal(seals.sat, original.timbre.selloSAT);
    assert.equal(seals.cad, original.timbre.cadenaOriginal);
  }
  assert.equal(await contador(), antesReales + 2);

  // ---- Barra de acciones: sin "Compartir"; "Ver original" abre una vista previa dentro de la app
  await c.click(rowFor(UUID_PAC1));
  await c.waitFor('Boolean(document.querySelector("[data-testid=view-original]"))');
  assert.equal(await c.evaluate('[...document.querySelectorAll(".fac-bar-actions button")].some((b) => /Compartir/i.test(b.innerText))'), false, 'sin botón Compartir');
  assert.equal(await c.evaluate('document.querySelectorAll("[role=tab]").length'), 0, 'ya no hay pestañas Todas/Emitidas/Recibidas');
  const abrirOriginal = async () => { await c.click('[data-testid=view-original]'); await c.waitFor('Boolean(document.querySelector("[data-testid=original-preview]"))'); };
  await abrirOriginal();
  await c.waitFor('Boolean(document.querySelector("[data-testid=original-frame]"))');
  assert.match(await c.evaluate('document.querySelector("[data-testid=original-frame]").src'), /^blob:/, 'el PDF original se muestra en un iframe sobre un blob');
  assert.equal(await c.evaluate('Boolean(document.querySelector("[data-testid=original-download]"))'), true, 'la vista previa ofrece Descargar');
  await c.evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
  await c.waitFor('!document.querySelector("[data-testid=original-preview]")');
  await abrirOriginal();
  await c.click('[data-testid=original-close]');
  await c.waitFor('!document.querySelector("[data-testid=original-preview]")');
  await abrirOriginal();
  await c.evaluate('document.querySelector("[data-testid=original-preview]").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))');
  await c.waitFor('!document.querySelector("[data-testid=original-preview]")');
  const uuidXml = await c.evaluate(`JSON.parse(localStorage.getItem('jcmotors.invoices')).find((i) => i.archivoTipo === 'xml')?.uuid`);
  if (uuidXml) {
    await c.click(rowFor(uuidXml));
    await abrirOriginal();
    assert.match(await c.evaluate('document.querySelector("[data-testid=original-xml]").textContent'), /cfdi:Comprobante/, 'un XML original se muestra como texto');
    await c.click('[data-testid=original-close]');
    await c.waitFor('!document.querySelector("[data-testid=original-preview]")');
  }

  // ---- Filtro por fechas de emisión
  const totalFacturas = await rows();
  assert.equal(await c.evaluate('document.querySelector("[data-testid=date-filter]").innerText.trim()'), 'Todas las fechas');
  const elegirDia = async (iso) => {
    for (let i = 0; i < 200; i++) {
      const hecho = await c.evaluate(`(() => { const b = document.querySelector('.profit-cal-day[data-date="${iso}"]'); if (b && !b.classList.contains('is-outside')) { b.click(); return true; } const mid = document.querySelectorAll('.profit-cal-day')[20].dataset.date; document.querySelector(${JSON.stringify(iso)} < mid ? '.profit-cal-prev' : '.profit-cal-next').click(); return false; })()`);
      if (hecho) return;
    }
    throw new Error(`no se encontró ${iso} en el calendario`);
  };
  const filtrarPor = async (desde, hasta) => {
    await c.click('[data-testid=date-filter]');
    await c.waitFor('Boolean(document.querySelector(".profit-range-popover"))');
    await elegirDia(desde);
    await elegirDia(hasta);
    await c.evaluate('[...document.querySelectorAll(".profit-cal-actions button")].find((b) => /Aplicar/i.test(b.innerText)).click()');
    await c.waitFor('!document.querySelector(".profit-range-popover")');
  };
  const esperadas = (desde, hasta) => c.evaluate(`JSON.parse(localStorage.getItem('jcmotors.invoices')).filter((i) => i.fechaEmision.slice(0, 10) >= '${desde}' && i.fechaEmision.slice(0, 10) <= '${hasta}').length`);
  await filtrarPor('2026-10-14', '2026-10-16');
  const dentro = await esperadas('2026-10-14', '2026-10-16');
  assert.ok(dentro >= 2 && dentro < totalFacturas, 'el rango deja fuera algunas facturas');
  assert.equal(await rows(), dentro, 'la lista solo muestra facturas emitidas dentro del rango');
  assert.match(await c.evaluate('document.querySelector("[data-testid=invoice-count]").innerText'), new RegExp(`^${dentro} de ${totalFacturas} facturas$`));
  assert.equal(await c.evaluate('Boolean(document.querySelector(`[data-testid=invoice-row][data-selected=true]`))'), true, 'queda una factura visible seleccionada');
  await filtrarPor('2020-01-01', '2020-01-02');
  assert.equal(await rows(), 0);
  assert.match(await c.evaluate('document.querySelector("[data-testid=invoice-list]").innerText'), /Ninguna factura con fecha de emisión en ese rango/);
  assert.equal(await c.evaluate('Boolean(document.querySelector("[data-testid=view-original]"))'), false, 'sin factura visible no queda vista previa abierta');
  await c.click('[data-testid=date-filter-clear]');
  assert.equal(await rows(), totalFacturas, 'quitar el filtro devuelve todas las facturas');
  assert.equal(await c.evaluate('document.querySelector("[data-testid=date-filter]").innerText.trim()'), 'Todas las fechas');

  // Un sello truncado se importa igual, pero la interfaz lo advierte (punto ámbar + franja)
  await c.evaluate(`(() => { const list = JSON.parse(localStorage.getItem('jcmotors.invoices')); const i = list.find((x) => x.uuid === ${JSON.stringify(UUID_G)}); i.timbre.selloSAT = i.timbre.selloSAT.slice(0, 300); i.selloIncompleto = true; localStorage.setItem('jcmotors.invoices', JSON.stringify(list)); location.reload(); })()`);
  await c.waitFor('Boolean(document.querySelector("[data-testid=xml-input]"))');
  await c.waitFor(`Boolean(document.querySelector('${rowFor(UUID_G)} [data-testid=row-sello-dot]'))`);
  await c.click(rowFor(UUID_G));
  await c.waitFor('Boolean(document.querySelector("[data-testid=doubt-banner]"))');
  assert.match(await c.evaluate('document.querySelector("[data-testid=doubt-banner]").innerText'), /sello digital no se extrajo completo/);
  await new Promise((r) => setTimeout(r, 1200));
  await c.screenshot('tests/artifacts/facturas/facturas.png');

  assert.deepEqual(c.errors, []);
  console.log('facturas: OK');
} finally {
  c.close();
}
