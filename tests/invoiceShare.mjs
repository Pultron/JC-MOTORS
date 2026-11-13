process.env.TZ = 'America/Mazatlan';
import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { createFakeDb } from './fakeDb.mjs';
import { SqliteRoutedStorage, setActiveSqliteStorage } from '../src/storage/sqliteStorage.ts';
import { setStorageOverride } from '../src/storage/safeStorage.ts';
import { createInvoiceRepository } from '../src/repositories/repositoryFactory.ts';
import { LocalStorageInvoiceRepository, INVOICES_STORAGE_KEY } from '../src/repositories/LocalStorageInvoiceRepository.ts';
import {
  DEFAULT_INVOICE_MESSAGE_TEMPLATE, INVOICE_MESSAGE_VARIABLES, buildInvoiceShareMessage, buildInvoiceShareSubject, previewInvoiceMessage, renderTemplate,
} from '../src/services/shareMessage.ts';
import { invoiceAttachment, invoiceFilenameBase, resolveInvoiceContact } from '../src/services/invoiceShare.ts';
import { sanitizeFileBase } from '../src/services/shareQuotation.ts';
import { shareLineText } from '../src/services/shareStatus.ts';

const { data } = installMemoryStorage();
const business = { nombre: 'JC Motors', telefonos: ['(667) 351-8806'] };
const invoice = (overrides = {}) => ({
  folio: 42, uuid: 'u-42', total: '4350.00', moneda: 'MXN', receptor: { rfc: 'AAA010101AAA', nombre: 'REFACCIONARIA EL ÁGUILA SA DE CV', regimenFiscal: '601', codigoPostal: '80020', usoCFDI: 'G03' },
  archivoOriginal: Buffer.from('<?xml version="1.0"?><a/>').toString('base64'), archivoTipo: 'xml', archivoNombre: 'a.xml', ...overrides,
});
const customer = (id, name, phone = '', email = '', aliases = []) => ({ id, name, phone, email, aliases });

beforeEach(() => { data.clear(); setStorageOverride(undefined); setActiveSqliteStorage(undefined); });

test('default invoice template is the agreed text, byte for byte', () => {
  assert.equal(DEFAULT_INVOICE_MESSAGE_TEMPLATE, 'Hola {nombre}, te comparto tu factura {folio} de {taller}.\nTotal: {total}\nCualquier duda, estamos a tus órdenes.\n{taller} · {telefono_taller}');
  assert.deepEqual(INVOICE_MESSAGE_VARIABLES.map((variable) => variable.key), ['nombre', 'folio', 'taller', 'total', 'telefono_taller']);
});

test('the invoice message fills every variable', () => {
  const { text, subject } = buildInvoiceShareMessage(invoice(), business);
  assert.equal(text, ['Hola Refaccionaria, te comparto tu factura 0042 de JC Motors.', 'Total: $4,350.00', 'Cualquier duda, estamos a tus órdenes.', 'JC Motors · (667) 351-8806'].join('\n'));
  assert.equal(subject, 'Factura 0042 · JC Motors');
  assert.equal(buildInvoiceShareSubject(7, 'X'), 'Factura 0007 · X');
});

test('the greeting prefers the matched customer name and keeps normal casing', () => {
  assert.match(buildInvoiceShareMessage(invoice(), business, 'María José Pérez').text, /^Hola María,/);
  assert.match(buildInvoiceShareMessage(invoice({ receptor: { ...invoice().receptor, nombre: 'Juan Pérez' } }), business).text, /^Hola Juan,/);
});

test('a custom template wins; blank falls back; unknown and quotation-only variables stay intact', () => {
  assert.equal(buildInvoiceShareMessage(invoice(), { ...business, mensajeFacturas: 'Factura {folio} {vehiculo} {x}' }).text, 'Factura 0042 {vehiculo} {x}');
  assert.match(buildInvoiceShareMessage(invoice(), { ...business, mensajeFacturas: '   ' }).text, /^Hola Refaccionaria, te comparto tu factura/);
  assert.equal(buildInvoiceShareMessage(invoice(), { ...business, mensajeClientes: 'cotización {folio}' }).text.includes('cotización'), false, 'the quotation template is never used for invoices');
});

test('foreign currency is shown next to the total; a malformed total is kept as is', () => {
  assert.match(buildInvoiceShareMessage(invoice({ moneda: 'USD' }), business).text, /Total: \$4,350\.00 USD/);
  assert.match(buildInvoiceShareMessage(invoice({ total: 'abc' }), business).text, /Total: abc/);
});

test('renderTemplate still drops " para tu {vehiculo}" for quotations and ignores it for invoices', () => {
  assert.equal(renderTemplate('Hola {nombre} para tu {vehiculo}.', { nombre: 'Ana', vehiculo: '' }), 'Hola Ana.');
  assert.equal(renderTemplate('Hola {nombre} para tu {vehiculo}.', { nombre: 'Ana' }), 'Hola Ana para tu {vehiculo}.');
  assert.equal(renderTemplate('{toString} {constructor}', { nombre: 'Ana' }), '{toString} {constructor}');
});

test('preview uses the invoice sample values', () => {
  assert.equal(previewInvoiceMessage('Factura {folio}: {total} de {taller}'), 'Factura 0042: $4,350.00 de JC MOTORS');
});

test('file base name: "Factura 0042 - receptor", sanitized, no extension', () => {
  assert.equal(invoiceFilenameBase(invoice({ receptor: { ...invoice().receptor, nombre: 'Ana: "López" / Hijos' } })), 'Factura 0042 - Ana López Hijos');
  assert.equal(invoiceFilenameBase(invoice({ receptor: { ...invoice().receptor, nombre: '  ' } })), 'Factura 0042');
  assert.equal(sanitizeFileBase('algo.XML'), 'algo');
  assert.equal(sanitizeFileBase('algo.pdf'), 'algo');
});

test('contact resolution matches the receptor by normalized name or alias', () => {
  const customers = [customer('a', 'Otro', '6670000000'), customer('b', 'refaccionaria el aguila sa de cv', '(667) 123-4567', 'compras@aguila.mx')];
  const found = resolveInvoiceContact(invoice(), customers);
  assert.equal(found.customer.id, 'b');
  assert.deepEqual(found.contact, { phone: '(667) 123-4567', email: 'compras@aguila.mx' });
  assert.equal(resolveInvoiceContact(invoice(), [customer('c', 'Otro', '6670000000', 'a@b.mx', ['Refaccionaria El Águila SA de CV'])]).customer.id, 'c', 'alias match');
  assert.deepEqual(resolveInvoiceContact(invoice(), [customer('a', 'Otro', '6670000000')]), { contact: { phone: '', email: '' } });
});

test('contact resolution takes each medium from the first same-name customer that has it usable', () => {
  const customers = [customer('a', 'Refaccionaria El Águila SA de CV', '123', ''), customer('b', 'Refaccionaria El Águila SA de CV', '6671234567', 'mal@correo')];
  const found = resolveInvoiceContact(invoice(), customers);
  assert.equal(found.customer.id, 'a');
  assert.deepEqual(found.contact, { phone: '6671234567', email: '' });
});

test('the attachment is the original file with its own extension; no original -> error', () => {
  const xml = invoiceAttachment(invoice());
  assert.equal(xml.ext, 'xml');
  assert.equal(Buffer.from(xml.bytes).toString(), '<?xml version="1.0"?><a/>');
  const pdf = invoiceAttachment(invoice({ archivoTipo: 'pdf', archivoOriginal: Buffer.from('%PDF-1.4').toString('base64') }));
  assert.equal(pdf.ext, 'pdf');
  assert.throws(() => invoiceAttachment(invoice({ archivoOriginal: '' })), /archivo original/);
});

test('markShared records channel and time; old invoices and unknown ids are safe; bad stored values are dropped', async () => {
  const repo = new LocalStorageInvoiceRepository();
  await repo.save(invoice());
  assert.equal((await repo.getById('u-42')).sharedAt, undefined);
  assert.equal(shareLineText((await repo.getById('u-42')), new Date()), 'Sin compartir');
  const shared = await repo.markShared('u-42', 'whatsapp');
  assert.equal(shared.sharedVia, 'whatsapp');
  assert.ok(!Number.isNaN(Date.parse(shared.sharedAt)));
  assert.deepEqual({ via: (await repo.getById('u-42')).sharedVia, at: (await repo.getById('u-42')).sharedAt }, { via: 'whatsapp', at: shared.sharedAt });
  assert.equal((await repo.markShared('u-42', 'email')).sharedVia, 'email', 'the last share wins');
  assert.equal(await repo.markShared('nope', 'email'), undefined);

  data.set(INVOICES_STORAGE_KEY, JSON.stringify([{ ...invoice(), sharedAt: 5, sharedVia: 'fax' }, { ...invoice({ uuid: 'u-2' }), sharedAt: '2026-11-12T00:00:00.000Z', sharedVia: 'email' }]));
  const [bad, good] = await repo.getAll();
  assert.equal('sharedAt' in bad || 'sharedVia' in bad, false);
  assert.equal(good.sharedVia, 'email');
});

test('markShared goes through the sqlite-routed storage and waits for its confirmation', async () => {
  const fake = createFakeDb();
  const storage = new SqliteRoutedStorage({ apply: fake.db.apply, snapshot: {}, fallback: globalThis.localStorage, onReverted: () => {} });
  setStorageOverride(storage);
  setActiveSqliteStorage(storage);
  const repo = createInvoiceRepository();
  await repo.save(invoice());
  assert.equal((await repo.markShared('u-42', 'email')).sharedVia, 'email');
  fake.state.failApply = true;
  await assert.rejects(repo.markShared('u-42', 'whatsapp'), /disco lleno/);
  assert.equal((await repo.getById('u-42')).sharedVia, 'email', 'a rejected write is not kept');
});
