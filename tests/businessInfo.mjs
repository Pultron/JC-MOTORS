import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { DEFAULT_BUSINESS_INFO, loadBusinessInfo, resetBusinessInfo, saveBusinessInfo, validateBusinessInfo } from '../src/config/businessInfo.ts';
import { buildBackup, parseBackup, serializeBackup, applyBackup, BackupError } from '../src/storage/backupService.ts';
import { BACKUP_EXPORT_KEYS, STORAGE_KEYS } from '../src/storage/storageKeys.ts';
import { subscribeStorageNotices } from '../src/storage/storageNotices.ts';
import { buildQuotationPdf } from '../src/utils/pdfQuotation.ts';
import { toPublicQuotation } from '../src/utils/quotation.ts';

const { data, control } = installMemoryStorage();
const notices = [];
subscribeStorageNotices((notice) => notices.push(notice));
beforeEach(() => { data.clear(); control.quota = Infinity; notices.length = 0; });

const KEY = 'jc-motors:business-info:v1';
const custom = { nombre: 'TALLER PRUEBA', telefonos: ['6671234567'], direccion: 'Calle 1 #2\nCol. Centro, Culiacán', correo: 'hola@taller.mx' };

test('#019 the key is in storageKeys and travels in the backup', () => {
  assert.equal(STORAGE_KEYS.businessInfo, KEY);
  assert.ok(BACKUP_EXPORT_KEYS.includes(KEY));
});

test('#019 defaults are exactly the values that were hardcoded in the PDF', () => {
  assert.deepEqual(loadBusinessInfo(), {
    nombre: 'JC MOTORS',
    telefonos: ['(667) 351-8806'],
    direccion: 'Av. Río Ometepec #1136,\nCol. Morelos, Culiacán, Sin.',
    correo: 'JCMOTORSCLN@gmail.com',
  });
  assert.equal(data.has(KEY), false);
});

test('#019 save normalizes the phone and load reads it back', () => {
  const saved = saveBusinessInfo(custom);
  assert.deepEqual(saved.telefonos, ['(667) 123-4567']);
  assert.deepEqual(JSON.parse(data.get(KEY)), saved);
  assert.deepEqual(loadBusinessInfo(), saved);
});

test('#019 corrupt or unexpected data falls back to the defaults, keeps the raw copy and does not throw', () => {
  data.set(KEY, '{not json');
  assert.deepEqual(loadBusinessInfo(), { ...DEFAULT_BUSINESS_INFO, telefonos: ['(667) 351-8806'] });
  assert.ok([...data.keys()].some((key) => key.startsWith('jc-motors:backup:business-info:')));
  assert.equal(notices.length, 1);
  data.set(KEY, JSON.stringify({ nombre: 5 }));
  assert.equal(loadBusinessInfo().nombre, 'JC MOTORS');
  data.set(KEY, 'null');
  assert.equal(loadBusinessInfo().nombre, 'JC MOTORS');
});

test('#019 reset removes the stored copy', () => {
  saveBusinessInfo(custom);
  const defaults = resetBusinessInfo();
  assert.equal(data.has(KEY), false);
  assert.equal(defaults.nombre, 'JC MOTORS');
  assert.equal(loadBusinessInfo().nombre, 'JC MOTORS');
});

test('#019 validation: 10-digit phone, name, address and email', () => {
  assert.deepEqual(validateBusinessInfo(custom), {});
  assert.ok(validateBusinessInfo({ ...custom, telefonos: ['12345'] }).telefono);
  assert.ok(validateBusinessInfo({ ...custom, telefonos: [''] }).telefono);
  assert.deepEqual(validateBusinessInfo({ ...custom, telefonos: ['(667) 123-4567'] }), {});
  assert.ok(validateBusinessInfo({ ...custom, nombre: '  ' }).nombre);
  assert.ok(validateBusinessInfo({ ...custom, direccion: 'a\nb\nc' }).direccion);
  assert.ok(validateBusinessInfo({ ...custom, correo: 'sin-arroba' }).correo);
  assert.deepEqual(validateBusinessInfo({ ...custom, correo: '' }), {});
  assert.throws(() => saveBusinessInfo({ ...custom, telefonos: ['123'] }));
  assert.equal(data.has(KEY), false);
});

test('#019 a full storage makes save throw and keeps the previous value', () => {
  saveBusinessInfo(custom);
  const before = data.get(KEY);
  control.quota = [...data].reduce((sum, [key, value]) => sum + key.length + value.length, 0) + 5;
  assert.throws(() => saveBusinessInfo({ ...custom, nombre: 'UN NOMBRE MUCHO MAS LARGO' }));
  assert.equal(data.get(KEY), before);
});

test('#019 backup: exported, validated on import, merge keeps local and replace overwrites', () => {
  saveBusinessInfo(custom);
  const backup = parseBackup(serializeBackup(buildBackup()));
  assert.ok(backup.claves[KEY]);
  assert.throws(() => parseBackup(serializeBackup({ ...backup, claves: { [KEY]: '{"nombre":1}' } })), BackupError);

  const incoming = { ...backup, claves: { [KEY]: JSON.stringify({ nombre: 'DEL ARCHIVO', telefonos: ['(667) 000-0000'], direccion: 'X' }) } };
  applyBackup(incoming, 'merge');
  assert.equal(loadBusinessInfo().nombre, 'TALLER PRUEBA');
  applyBackup(incoming, 'replace');
  assert.equal(loadBusinessInfo().nombre, 'DEL ARCHIVO');
  data.delete(KEY);
  applyBackup(incoming, 'merge');
  assert.equal(loadBusinessInfo().nombre, 'DEL ARCHIVO');
});

test('share message: optional field, old data loads, backup validates with and without it', () => {
  assert.equal(loadBusinessInfo().mensajeClientes, undefined);
  data.set(KEY, JSON.stringify({ nombre: 'VIEJO', telefonos: ['(667) 000-0000'], direccion: 'X' }));
  assert.equal(loadBusinessInfo().nombre, 'VIEJO');
  assert.equal(loadBusinessInfo().mensajeClientes, undefined);

  const saved = saveBusinessInfo({ ...custom, mensajeClientes: '  Hola {nombre}\nSaludos  ' });
  assert.equal(saved.mensajeClientes, 'Hola {nombre}\nSaludos');
  assert.equal(loadBusinessInfo().mensajeClientes, 'Hola {nombre}\nSaludos');
  assert.equal('mensajeClientes' in saveBusinessInfo({ ...custom, mensajeClientes: '   ' }), false);

  assert.ok(validateBusinessInfo({ ...custom, mensajeClientes: 'x'.repeat(801) }).mensajeClientes);
  assert.deepEqual(validateBusinessInfo({ ...custom, mensajeClientes: 'x'.repeat(800) }), {});

  saveBusinessInfo({ ...custom, mensajeClientes: 'Hola {nombre}' });
  const backup = parseBackup(serializeBackup(buildBackup()));
  assert.equal(JSON.parse(backup.claves[KEY]).mensajeClientes, 'Hola {nombre}');
  const base = JSON.parse(backup.claves[KEY]);
  for (const bad of [{ ...base, mensajeClientes: 5 }, { ...base, mensajeClientes: 'x'.repeat(801) }]) {
    assert.throws(() => parseBackup(serializeBackup({ ...backup, claves: { [KEY]: JSON.stringify(bad) } })), BackupError);
  }
  const { mensajeClientes: _omit, ...without } = base;
  assert.doesNotThrow(() => parseBackup(serializeBackup({ ...backup, claves: { [KEY]: JSON.stringify(without) } })));
});

// --- PDF ---------------------------------------------------------------------------------------------------------
const outDir = join(tmpdir(), 'jc-motors-pdf-tests');
mkdirSync(outDir, { recursive: true });
const b64 = (path) => readFileSync(new URL(path, import.meta.url)).toString('base64');
const assets = {
  regular: b64('../src/assets/fonts/Inter_400Regular.ttf'),
  bold: b64('../src/assets/fonts/Inter_700Bold.ttf'),
  extraBold: b64('../src/assets/fonts/Inter_800ExtraBold.ttf'),
  logo: `data:image/png;base64,${b64('../src/assets/jc-motors-logo.png')}`,
};

function pdfText(name) {
  const quotation = toPublicQuotation({
    id: 'q', folio: 'JC-0001', createdAt: '2026-11-03T12:00:00',
    customer: { name: 'jose', phone: '2434213213', email: 'jose@gmail.com' },
    vehicle: { make: 'Suzuki', model: 'Jimny', year: 2023, plates: 'Q3E223231132' },
    items: [{ id: 'i1', type: 'part', description: 'Cambio de aceite', quantity: 1, saleUnitPrice: 100, amount: 100 }],
    laborDiscountType: 'percentage', laborDiscountValue: 0, includeVat: false, validityDays: 15, publicNotes: '', status: 'Pendiente',
  });
  const file = join(outDir, `${name}.pdf`);
  writeFileSync(file, Buffer.from(buildQuotationPdf(quotation, assets).output('arraybuffer')));
  return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
}

test('#019 PDF with defaults prints the original contact data; custom data replaces it', () => {
  const original = pdfText('business-default');
  for (const text of ['JC MOTORS', 'Av. Río Ometepec #1136,', 'Col. Morelos, Culiacán, Sin.', '(667) 351-8806', 'JCMOTORSCLN@gmail.com', 'Gracias por confiar en JC Motors.']) {
    assert.ok(original.includes(text), `missing in default PDF: ${text}`);
  }
  saveBusinessInfo(custom);
  const changed = pdfText('business-custom');
  for (const text of ['TALLER PRUEBA', 'Calle 1 #2', 'Col. Centro, Culiacán', '(667) 123-4567', 'hola@taller.mx', 'Gracias por confiar en TALLER PRUEBA.']) {
    assert.ok(changed.includes(text), `missing in custom PDF: ${text}`);
  }
  assert.ok(!changed.includes('JCMOTORSCLN') && !changed.includes('351-8806'));
});

test('#019 PDF with a corrupt key still generates with the defaults', () => {
  data.set(KEY, '[[[');
  assert.ok(pdfText('business-corrupt').includes('(667) 351-8806'));
});
