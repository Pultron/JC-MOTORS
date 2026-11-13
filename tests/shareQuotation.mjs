process.env.TZ = 'America/Mazatlan';
import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { LocalStorageQuotationRepository } from '../src/repositories/LocalStorageQuotationRepository.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';
import { buildBackup, parseBackup, serializeBackup } from '../src/storage/backupService.ts';
import { toPublicQuotation } from '../src/utils/quotation.ts';
import {
  buildGmailUrl, buildMailtoUrl, buildWhatsAppUrl, decideShareStep, effectiveContact, hasEmailMedium, hasWhatsAppMedium,
  percentEncode, sanitizeFileBase, sharedFilenameBase, sharedLabel, ShareInputError,
} from '../src/services/shareQuotation.ts';

const { data } = installMemoryStorage();
beforeEach(() => data.clear());

const TEXT = "Hola María, cotización #5 con 100% de $ ñandú\nTotal: $4,350.00 & más (ok) *!'";

test('percentEncode matches the Rust encoder: only letters, digits and -._~ stay', () => {
  assert.equal(percentEncode('Aa09-._~'), 'Aa09-._~');
  assert.equal(percentEncode("!'()*"), '%21%27%28%29%2A');
  assert.equal(percentEncode('á ñ\n$#&%+'), '%C3%A1%20%C3%B1%0A%24%23%26%25%2B');
});

test('WhatsApp URL: wa.me/52 + 10 digits, text encoded once, accents/newlines/$/# survive', () => {
  const url = buildWhatsAppUrl('(667) 123-4567', TEXT);
  assert.match(url, /^https:\/\/wa\.me\/526671234567\?text=/);
  const encoded = url.split('?text=')[1];
  assert.doesNotMatch(encoded, /[^A-Za-z0-9\-._~%]/);
  assert.equal(decodeURIComponent(encoded), TEXT);
  assert.equal(buildWhatsAppUrl('+52 667 123 4567', 'x'), 'https://wa.me/526671234567?text=x');
  assert.throws(() => buildWhatsAppUrl('12345', 'x'), ShareInputError);
});

test('mailto and Gmail URLs encode subject and body, keep the address readable', () => {
  const subject = 'Cotización JC-0005 · JC Motors';
  const mailto = buildMailtoUrl(' ana@correo.com ', subject, TEXT);
  assert.ok(mailto.startsWith('mailto:ana@correo.com?subject=Cotizaci%C3%B3n%20JC-0005%20%C2%B7%20JC%20Motors&body='));
  assert.equal(decodeURIComponent(mailto.split('&body=')[1]), TEXT);
  const gmail = buildGmailUrl('ana+x@correo.com', subject, TEXT);
  assert.ok(gmail.startsWith('https://mail.google.com/mail/?view=cm&fs=1&to=ana%2Bx%40correo.com&su=Cotizaci%C3%B3n'));
  assert.equal(decodeURIComponent(gmail.split('&body=')[1]), TEXT);
  assert.doesNotMatch(gmail.split('&su=')[1], /[^A-Za-z0-9\-._~%&=]/);
});

test('sanitizeFileBase mirrors the native sanitizer', () => {
  assert.equal(sanitizeFileBase('Cotización JC-0005 - María José'), 'Cotización JC-0005 - María José');
  assert.equal(sanitizeFileBase('a<b>c:d"e/f\\g|h?i*j'), 'abcdefghij');
  assert.equal(sanitizeFileBase('  muchos   espacios \t y\ntabs  '), 'muchos espacios ytabs'); // control chars are dropped before words are joined, like the Rust side
  assert.equal(sanitizeFileBase('reporte.PDF'), 'reporte');
  assert.equal(sanitizeFileBase('final. . '), 'final');
  assert.equal(sanitizeFileBase('???'), 'Documento');
  assert.equal(sanitizeFileBase('con'), '_con');
  assert.equal(sanitizeFileBase('LPT1.txt'), '_LPT1.txt');
  assert.equal(sanitizeFileBase('x'.repeat(300)).length, 120);
  assert.equal(sharedFilenameBase('JC-0005', 'Ana: "la" jefa/boss'), 'Cotización JC-0005 - Ana la jefaboss');
  assert.equal(sharedFilenameBase('JC-0005', '  '), 'Cotización JC-0005');
});

test('media detection: complete phone, shareable ASCII email', () => {
  assert.equal(hasWhatsAppMedium({ phone: '(667) 123-4567', email: '' }), true);
  assert.equal(hasWhatsAppMedium({ phone: '667123', email: '' }), false);
  assert.equal(hasWhatsAppMedium({ phone: '', email: '' }), false);
  assert.equal(hasEmailMedium({ phone: '', email: 'ana@correo.com' }), true);
  assert.equal(hasEmailMedium({ phone: '', email: 'sin-arroba' }), false);
  assert.equal(hasEmailMedium({ phone: '', email: 'año@correo.com' }), false);
});

test('missing-medium decision: which dialog and which "instead" link', () => {
  const both = { phone: '6671234567', email: 'a@b.com' };
  const onlyPhone = { phone: '6671234567', email: '' };
  const onlyEmail = { phone: '', email: 'a@b.com' };
  const none = { phone: '', email: '' };
  assert.deepEqual(decideShareStep('whatsapp', both), { kind: 'ready' });
  assert.deepEqual(decideShareStep('email', both), { kind: 'ready' });
  assert.deepEqual(decideShareStep('email', onlyPhone), { kind: 'missing', medium: 'email', alternative: 'whatsapp' });
  assert.deepEqual(decideShareStep('whatsapp', onlyEmail), { kind: 'missing', medium: 'whatsapp', alternative: 'email' });
  assert.deepEqual(decideShareStep('whatsapp', none), { kind: 'missing', medium: 'whatsapp', alternative: null });
  assert.deepEqual(decideShareStep('email', none), { kind: 'missing', medium: 'email', alternative: null });
  // An incomplete phone is not a medium, so email does not offer WhatsApp "instead".
  assert.deepEqual(decideShareStep('email', { phone: '6671', email: '' }), { kind: 'missing', medium: 'email', alternative: null });
});

test('effectiveContact completes the quotation snapshot with the saved customer record', () => {
  const quotation = { customerId: 'c1', customer: { name: 'Ana', phone: '', email: 'ana@correo.com' } };
  const customers = [{ id: 'c1', phone: '6671234567', email: 'otro@correo.com' }];
  assert.deepEqual(effectiveContact(quotation, customers), { phone: '6671234567', email: 'ana@correo.com' });
  assert.deepEqual(effectiveContact({ customer: { name: 'Ana', phone: '' } }, customers), { phone: '', email: '' });
});

test('sharedLabel is empty without a record, readable with one', () => {
  assert.equal(sharedLabel({}), '');
  assert.match(sharedLabel({ sharedAt: '2026-11-12T23:40:00.000Z', sharedVia: 'whatsapp' }), /^Compartida por WhatsApp el 12 de noviembre de 2026, 4:40\sp\.\s?m\.$/);
  assert.match(sharedLabel({ sharedAt: '2026-11-12T23:40:00.000Z', sharedVia: 'email' }), /^Compartida por correo el /);
  assert.equal(sharedLabel({ sharedAt: 'basura', sharedVia: 'email' }), '');
});

const input = (name = 'Ana') => ({
  customer: { name, phone: '', email: 'ana@correo.com' }, vehicle: { make: 'Nissan', model: 'Sentra', plates: 'ABC' },
  items: [{ id: 'i1', type: 'part', description: 'Filtro', quantity: 1, saleUnitPrice: 100 }],
  laborDiscountType: 'percentage', laborDiscountValue: 0, includeVat: true, validityDays: 15, publicNotes: '',
});

test('sharedAt/sharedVia persist, survive reload and backup, and stay out of the public quotation', async () => {
  const repo = new LocalStorageQuotationRepository();
  const created = await repo.create(input());
  assert.equal(created.sharedAt, undefined);
  const shared = await repo.markShared(created.id, 'whatsapp');
  assert.equal(shared.sharedVia, 'whatsapp');
  assert.ok(Date.parse(shared.sharedAt) > 0);

  const reloaded = await new LocalStorageQuotationRepository().getById(created.id);
  assert.equal(reloaded.sharedVia, 'whatsapp');
  assert.equal(reloaded.sharedAt, shared.sharedAt);

  const backup = parseBackup(serializeBackup(buildBackup()));
  assert.equal(JSON.parse(backup.claves[STORAGE_KEYS.quotations])[0].sharedVia, 'whatsapp');

  assert.equal('sharedAt' in toPublicQuotation(reloaded), false);
  assert.equal('sharedVia' in toPublicQuotation(reloaded), false);

  assert.equal(await repo.markShared('nope', 'email'), undefined);
});

test('legacy quotations (no share record) load; migration keeps a valid record and drops a malformed one', async () => {
  const legacy = (n, extra = {}) => ({
    id: `legacy-${n}`, folio: `JC-000${n}`, createdAt: new Date().toISOString(), status: 'Pendiente',
    customer: { name: `Cliente ${n}`, phone: '6671234567' }, vehicle: { make: 'Nissan', model: 'Sentra', plates: 'ABC' },
    items: [{ id: `i${n}`, description: 'Filtro', quantity: 1, unitPrice: 100 }], laborDiscountType: 'fixed', laborDiscountValue: 0, ivaEnabled: true, validityDays: 15, ...extra,
  });
  data.set(STORAGE_KEYS.quotations, JSON.stringify([
    legacy(1), legacy(2, { sharedAt: '2026-11-01T10:00:00.000Z', sharedVia: 'email' }), legacy(3, { sharedAt: 5, sharedVia: 'fax' }),
  ]));
  const list = await new LocalStorageQuotationRepository().list();
  const byFolio = Object.fromEntries(list.map((q) => [q.folio, q]));
  assert.equal(byFolio['JC-0001'].sharedAt, undefined);
  assert.equal(byFolio['JC-0002'].sharedVia, 'email');
  assert.equal(byFolio['JC-0003'].sharedAt, undefined);
});

test('editing a quotation clears its share record; completing the contact only touches phone/email', async () => {
  const repo = new LocalStorageQuotationRepository();
  const created = await repo.create(input());
  await repo.markShared(created.id, 'email');
  const withPhone = await repo.updateCustomerContact(created.id, { phone: '6671234567' });
  assert.equal(withPhone.customer.phone, '6671234567');
  assert.equal(withPhone.customer.email, 'ana@correo.com');
  assert.equal(withPhone.sharedVia, 'email');
  const cleared = await repo.updateCustomerContact(created.id, { email: '' });
  assert.equal('email' in cleared.customer, false);
  const edited = await repo.update(created.id, input('Ana López'));
  assert.equal(edited.sharedAt, undefined);
  assert.equal(edited.sharedVia, undefined);
});
