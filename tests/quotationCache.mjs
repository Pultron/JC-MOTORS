import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { LocalStorageQuotationRepository } from '../src/repositories/LocalStorageQuotationRepository.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';

const { data, storage } = installMemoryStorage();
beforeEach(() => data.clear());

const legacyEntry = (n, createdAt = new Date().toISOString()) => ({
  id: `legacy-${n}`, folio: `JC-000${n}`, createdAt, status: n === 2 ? 'Rechazada' : 'Pendiente',
  customer: { name: `Cliente ${n}`, phone: '6671234567' }, vehicle: { make: 'Nissan', model: 'Sentra', plates: 'ABC' },
  items: [{ id: `i${n}`, description: 'Filtro', quantity: 2, unitPrice: 100.5 }, { id: `l${n}`, description: 'Mano de obra', quantity: 1, unitPrice: 300 }],
  laborDiscountType: 'percentage', laborDiscountValue: 10, ivaEnabled: true, validityDays: 15,
});
const input = (name) => ({
  customer: { name, phone: '6671234567' }, vehicle: { make: 'Nissan', model: 'Sentra', plates: 'ABC' },
  items: [{ id: `i-${name}`, type: 'part', description: 'Filtro', quantity: 1, saleUnitPrice: 100 }],
  laborDiscountType: 'percentage', laborDiscountValue: 0, includeVat: true, validityDays: 15, publicNotes: '',
});

function spy() {
  const calls = { parse: 0, stringify: 0, setItem: 0 };
  const { parse, stringify } = JSON;
  const setItem = storage.setItem;
  JSON.parse = (...args) => { calls.parse += 1; return parse(...args); };
  JSON.stringify = (...args) => { calls.stringify += 1; return stringify(...args); };
  storage.setItem = (...args) => { calls.setItem += 1; return setItem(...args); };
  return { calls, restore: () => { JSON.parse = parse; JSON.stringify = stringify; storage.setItem = setItem; } };
}

test('#004-b datos anteriores: se normalizan y reescriben una sola vez, con el mismo contenido y orden', async () => {
  data.set(STORAGE_KEYS.quotations, JSON.stringify([legacyEntry(3), legacyEntry(2), legacyEntry(1)]));
  const repo = new LocalStorageQuotationRepository();
  const first = await repo.list();
  assert.deepEqual(first.map((q) => q.folio), ['JC-0003', 'JC-0002', 'JC-0001']);
  assert.equal(first[1].status, 'Cancelada');
  assert.equal(first[0].items[0].saleUnitPrice, 100.5);
  assert.equal(first[0].total, 546.36);
  assert.equal(JSON.parse(data.get(STORAGE_KEYS.schema)).quotations, 1);
  assert.equal(JSON.parse(data.get(STORAGE_KEYS.quotations))[1].status, 'Cancelada');

  const probe = spy();
  try {
    assert.deepEqual(await repo.list(), first);
    assert.deepEqual(await new LocalStorageQuotationRepository().list(), first);
    assert.equal(probe.calls.setItem, 0, 'leer no reescribe');
  } finally { probe.restore(); }
});

test('#004-b con el caché vigente, listar no parsea ni serializa', async () => {
  const repo = new LocalStorageQuotationRepository();
  await repo.create(input('A'));
  await repo.create(input('B'));
  const probe = spy();
  try {
    for (let n = 0; n < 5; n += 1) await repo.list();
    await repo.getById('no-existe');
    assert.equal(probe.calls.parse, 0);
    assert.equal(probe.calls.stringify, 0);
    assert.equal(probe.calls.setItem, 0);
  } finally { probe.restore(); }
});

test('#004-b el caché se invalida con escrituras propias y ajenas', async () => {
  const repo = new LocalStorageQuotationRepository();
  const a = await repo.create(input('A'));
  assert.equal((await repo.list()).length, 1);
  await repo.create(input('B'));
  assert.equal((await repo.list()).length, 2);
  const approved = await repo.approve(a.id);
  assert.equal((await repo.getById(a.id)).status, approved.status);

  const external = JSON.parse(data.get(STORAGE_KEYS.quotations));
  data.set(STORAGE_KEYS.quotations, JSON.stringify(external.slice(0, 1)));
  assert.equal((await repo.list()).length, 1, 'otra ventana escribió el mismo almacenamiento');
});

test('#004-b datos escritos por otra vía con forma anterior se normalizan aunque la versión esté al día', async () => {
  const repo = new LocalStorageQuotationRepository();
  await repo.create(input('A'));
  data.set(STORAGE_KEYS.quotations, JSON.stringify([legacyEntry(1)]));
  const [quotation] = await repo.list();
  assert.equal(quotation.items[0].saleUnitPrice, 100.5);
  assert.equal(quotation.items[0].type, 'part');
  assert.equal(quotation.items[1].type, 'labor');
});

test('#004-b pendiente vencida pasa a Vencida y se persiste una vez', async () => {
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  data.set(STORAGE_KEYS.quotations, JSON.stringify([legacyEntry(1, old), legacyEntry(3)]));
  const repo = new LocalStorageQuotationRepository();
  const list = await repo.list();
  assert.equal(list.find((q) => q.folio === 'JC-0001').status, 'Vencida');
  assert.equal(list.find((q) => q.folio === 'JC-0003').status, 'Pendiente');
  assert.equal(JSON.parse(data.get(STORAGE_KEYS.quotations)).find((q) => q.folio === 'JC-0001').status, 'Vencida');
  const probe = spy();
  try {
    await repo.list();
    assert.equal(probe.calls.setItem, 0);
  } finally { probe.restore(); }
});

test('#004-b dato dañado: lista vacía y el caché no oculta una corrección posterior', async () => {
  const repo = new LocalStorageQuotationRepository();
  data.set(STORAGE_KEYS.quotations, '{roto #004b');
  assert.deepEqual(await repo.list(), []);
  data.set(STORAGE_KEYS.quotations, JSON.stringify([legacyEntry(1)]));
  assert.equal((await repo.list()).length, 1);
});
