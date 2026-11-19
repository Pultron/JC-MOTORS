import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';

const mem = installMemoryStorage();
const { LocalStorageQuotationRepository } = await import('../src/repositories/LocalStorageQuotationRepository.ts');
const { STORAGE_KEYS } = await import('../src/storage/storageKeys.ts');
const { isDeletableStatus } = await import('../src/models/quotation.ts');

const input = (name = 'Carlos') => ({
  customer: { name, phone: '5512345678' },
  vehicle: { make: 'Nissan', model: 'Sentra', plates: 'ABC' },
  items: [{ id: 'p1', type: 'part', description: 'Filtro', quantity: 1, saleUnitPrice: 100 }],
  laborDiscountType: 'fixed', laborDiscountValue: 0, includeVat: false, validityDays: 15, publicNotes: '',
});

beforeEach(() => { mem.data.clear(); mem.control.quota = Infinity; });

async function approved(repo) {
  const created = await repo.create(input());
  return repo.approve(created.id);
}

test('cancelling an approved quotation requires a non-blank reason and changes nothing without it', async () => {
  const repo = new LocalStorageQuotationRepository();
  const q = await approved(repo);
  await assert.rejects(() => repo.cancel(q.id), /motivo/i);
  await assert.rejects(() => repo.cancel(q.id, '   '), /motivo/i);
  await assert.rejects(() => repo.cancel(q.id, 'x'.repeat(121)), /120/);
  const still = await repo.getById(q.id);
  assert.equal(still.status, 'Aprobada');
  assert.equal(still.cancellationReason, undefined);
});

test('approved cancel stores reason, date and previous status, and keeps the folio', async () => {
  const repo = new LocalStorageQuotationRepository();
  const q = await approved(repo);
  const before = Date.now();
  const cancelled = await repo.cancel(q.id, '  Se aprobó por error  ');
  assert.equal(cancelled.status, 'Cancelada');
  assert.equal(cancelled.cancellationReason, 'Se aprobó por error');
  assert.equal(cancelled.statusBeforeCancel, 'Aprobada');
  assert.ok(Date.parse(cancelled.cancelledAt) >= before - 1000);
  assert.equal(cancelled.folio, q.folio);
  assert.equal(cancelled.approvedAt, q.approvedAt);
  // A fresh repository (new process) reads the same record, with the fields intact.
  const reread = await new LocalStorageQuotationRepository().getById(q.id);
  assert.deepEqual(reread, cancelled);
  assert.equal(isDeletableStatus(reread.status), true);
});

test('a cancelled quotation cannot be edited, re-approved or cancelled again', async () => {
  const repo = new LocalStorageQuotationRepository();
  const q = await approved(repo);
  await repo.cancel(q.id, 'Motivo');
  assert.equal(await repo.update(q.id, input('Otro')), undefined);
  assert.equal(await repo.approve(q.id), undefined);
  assert.equal(await repo.cancel(q.id, 'Otra vez'), undefined);
  assert.equal((await repo.getById(q.id)).cancellationReason, 'Motivo');
});

test('pending cancel keeps working without a reason', async () => {
  const repo = new LocalStorageQuotationRepository();
  const q = await repo.create(input());
  const cancelled = await repo.cancel(q.id);
  assert.equal(cancelled.status, 'Cancelada');
  assert.equal(cancelled.statusBeforeCancel, 'Pendiente');
  assert.equal(cancelled.cancellationReason, undefined);
});

test('a failing write leaves the quotation approved and the stored data untouched', async () => {
  const repo = new LocalStorageQuotationRepository();
  const q = await approved(repo);
  const rawBefore = mem.data.get(STORAGE_KEYS.quotations);
  mem.control.quota = [...mem.data].reduce((sum, [k, v]) => sum + k.length + v.length, 0); // no room for a bigger value
  await assert.rejects(() => repo.cancel(q.id, 'Motivo largo para forzar el crecimiento del registro'));
  assert.equal(mem.data.get(STORAGE_KEYS.quotations), rawBefore);
  mem.control.quota = Infinity;
  const still = await repo.getById(q.id);
  assert.equal(still.status, 'Aprobada');
  assert.equal(still.cancelledAt, undefined);
});

test('the normalizer keeps cancellation fields, leaves old cancelled quotations alone and is idempotent', async () => {
  const repo = new LocalStorageQuotationRepository();
  const a = await approved(repo);
  const b = await repo.create(input('Ana'));
  await repo.cancel(a.id, 'Motivo A');
  await repo.cancel(b.id); // legacy-like: no reason
  const legacy = JSON.parse(mem.data.get(STORAGE_KEYS.quotations)).map((e) => {
    if (e.id !== b.id) return e;
    const { cancelledAt, statusBeforeCancel, ...old } = e;
    return old;
  });
  mem.data.set(STORAGE_KEYS.quotations, JSON.stringify(legacy));
  mem.data.delete(STORAGE_KEYS.schema); // force the normalizer
  const first = await new LocalStorageQuotationRepository().list();
  const second = await new LocalStorageQuotationRepository().list();
  assert.deepEqual(first, second);
  const normA = first.find((e) => e.id === a.id);
  assert.equal(normA.cancellationReason, 'Motivo A');
  assert.equal(normA.statusBeforeCancel, 'Aprobada');
  assert.ok(normA.cancelledAt);
  const normB = first.find((e) => e.id === b.id);
  assert.equal(normB.status, 'Cancelada');
  assert.equal('cancellationReason' in normB, false);
  assert.equal('cancelledAt' in normB, false);
});

test('backup and restore round-trip the cancellation fields byte for byte', async () => {
  const { applyBackup, buildBackup, parseBackup, serializeBackup } = await import('../src/storage/backupService.ts');
  const repo = new LocalStorageQuotationRepository();
  const q = await approved(repo);
  const cancelled = await repo.cancel(q.id, 'Se hará una cotización nueva');
  const before = mem.data.get(STORAGE_KEYS.quotations);
  const file = serializeBackup(buildBackup(new Date('2026-11-06T12:00:00')));
  mem.data.clear();
  applyBackup(parseBackup(file), 'replace');
  assert.equal(mem.data.get(STORAGE_KEYS.quotations), before);
  assert.deepEqual(await new LocalStorageQuotationRepository().getById(q.id), cancelled);
});
