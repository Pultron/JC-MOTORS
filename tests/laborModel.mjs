import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import { jsPDF } from 'jspdf';
import { installMemoryStorage } from './memoryStorage.mjs';
import { LocalStorageQuotationRepository } from '../src/repositories/LocalStorageQuotationRepository.ts';
import { applyBackup, buildBackup, parseBackup, serializeBackup } from '../src/storage/backupService.ts';
import { STORAGE_KEYS } from '../src/storage/storageKeys.ts';
import { planificar } from '../src/services/quotationLayout.ts';
import { registerFonts } from '../src/utils/pdfAssets.ts';
import { buildQuotationItems, calculateQuotationTotals, toPublicQuotation } from '../src/utils/quotation.ts';

const { data } = installMemoryStorage();
beforeEach(() => data.clear());

const b64 = (path) => readFileSync(new URL(path, import.meta.url)).toString('base64');
const assets = {
  regular: b64('../src/assets/fonts/Inter_400Regular.ttf'),
  bold: b64('../src/assets/fonts/Inter_700Bold.ttf'),
  extraBold: b64('../src/assets/fonts/Inter_800ExtraBold.ttf'),
  logo: `data:image/png;base64,${b64('../src/assets/jc-motors-logo.png')}`,
};
const doc = new jsPDF({ unit: 'mm', format: 'a4' });
registerFonts(doc, assets);

const item = (id, type, description, quantity, saleUnitPrice, extra = {}) => ({ id, type, description, quantity, saleUnitPrice, amount: Math.round(quantity * saleUnitPrice * 100) / 100, ...extra });

test('example: three services with their labor, 15% labor discount and IVA', () => {
  const items = [
    item('s1', 'part', 'Cambio de aceite', 1, 400), item('l1', 'labor', 'Mano de obra', 1, 150, { parentId: 's1' }),
    item('s2', 'part', 'Cambio de llantas', 4, 600), item('l2', 'labor', 'Mano de obra', 1, 200, { parentId: 's2' }),
    item('s3', 'part', 'Checado de aire', 1, 200), item('l3', 'labor', 'Mano de obra', 1, 50, { parentId: 's3' }),
  ];
  assert.deepEqual(calculateQuotationTotals(items, 'percentage', 15, true), {
    subtotalRefacciones: 3000, subtotalManoObra: 400, laborDiscount: 60, subtotalNeto: 3340, ivaAmount: 534.4, total: 3874.4,
  });
});

test('paired labor totals equal the same amounts as one loose labor line', () => {
  const parts = [item('s1', 'part', 'A', 1, 400), item('s2', 'part', 'B', 4, 600)];
  const paired = [parts[0], item('l1', 'labor', 'Mano de obra', 1, 150.5, { parentId: 's1' }), parts[1], item('l2', 'labor', 'Mano de obra', 1, 200.25, { parentId: 's2' })];
  const loose = [...parts, item('l', 'labor', 'Mano de obra', 1, 350.75)];
  for (const [type, value, vat] of [['percentage', 15, true], ['fixed', 100, false], ['percentage', 0, true]]) {
    assert.deepEqual(calculateQuotationTotals(paired, type, value, vat), calculateQuotationTotals(loose, type, value, vat));
  }
});

test('public quotation carries parentId only when present', () => {
  const quotation = {
    id: 'q', folio: 'JC-1', createdAt: '2026-10-01T10:00:00.000Z', customer: { name: 'A', phone: '' }, vehicle: { make: 'a', model: 'b', plates: 'c' },
    items: [item('s1', 'part', 'A', 1, 10), item('l1', 'labor', 'Mano de obra', 1, 5, { parentId: 's1' }), item('l2', 'labor', 'Mano de obra', 1, 5)],
    laborDiscountType: 'percentage', laborDiscountValue: 0, includeVat: true, validityDays: 15, publicNotes: '', status: 'Pendiente',
  };
  const pub = toPublicQuotation(quotation);
  assert.equal(pub.items[1].parentId, 's1');
  assert.equal('parentId' in pub.items[0], false);
  assert.equal('parentId' in pub.items[2], false);
});

// ---- Ten old-model quotations (no parentId, loose labor at the end), legacy shapes included.
const LONG = 'Reparación completa del sistema de suspensión delantera incluyendo rótulas, bujes, amortiguadores, alineación y balanceo con refacciones originales';
function oldQuote(n, { parts = 2, labor = 0, laborItems = 1, discount = ['percentage', 0], vat = true, long = false, legacy = false } = {}) {
  const items = Array.from({ length: parts }, (_, i) => item(`p${n}-${i}`, 'part', long ? `${LONG} ${i}` : `Refacción ${i + 1}`, 1 + (i % 3), 100.1 + i * 13.37));
  for (let i = 0; i < laborItems && labor > 0; i += 1) items.push(item(`l${n}-${i}`, 'labor', 'Mano de obra', 1, Math.round(labor / laborItems * 100) / 100));
  const totals = calculateQuotationTotals(items, discount[0], discount[1], vat);
  const base = {
    id: `q-${n}`, folio: `JC-${String(n).padStart(4, '0')}`, createdAt: '2026-10-01T10:00:00.000Z', customer: { name: `Cliente ${n}`, phone: '6671234567' },
    vehicle: { make: 'Nissan', model: 'Sentra', plates: 'ABC123' }, items, laborDiscountType: discount[0], laborDiscountValue: discount[1], includeVat: vat,
    subtotalNeto: totals.subtotalNeto, ivaAmount: totals.ivaAmount, total: totals.total, validityDays: 3650, publicNotes: '', customerNotes: '', status: 'Pendiente',
  };
  if (!legacy) return base;
  // Pre-"type" era: items without a type field, unitPrice instead of saleUnitPrice, ivaEnabled instead of includeVat.
  const { includeVat: _v, ...rest } = base;
  return { ...rest, ivaEnabled: vat, items: items.map(({ type: _t, saleUnitPrice, amount: _a, ...i }) => ({ ...i, unitPrice: saleUnitPrice })) };
}
const OLD = [
  oldQuote(1, { parts: 1 }),
  oldQuote(2, { parts: 3, labor: 350 }),
  oldQuote(3, { parts: 2, labor: 1200.5, discount: ['percentage', 15] }),
  oldQuote(4, { parts: 5, labor: 999.99, discount: ['fixed', 100.33], vat: false }),
  oldQuote(5, { parts: 8, labor: 500, laborItems: 2, discount: ['percentage', 5] }),
  oldQuote(6, { parts: 14, labor: 800, long: true }),
  oldQuote(7, { parts: 30, labor: 2500, discount: ['percentage', 10], vat: false }),
  oldQuote(8, { parts: 60, labor: 3300.33, long: true, discount: ['percentage', 15] }),
  oldQuote(9, { parts: 3, labor: 150, discount: ['fixed', 150], legacy: true }),
  oldQuote(10, { parts: 12, labor: 640, vat: false, legacy: true }),
];
const MODERN = OLD.filter((q) => q.items.every((i) => i.type));

const snap = (quotation) => {
  const pub = toPublicQuotation({ ...quotation, items: buildQuotationItems(quotation.items.map(({ amount: _a, ...i }) => i)) });
  return { total: pub.total, iva: pub.ivaAmount, discount: pub.laborDiscount, subtotalNeto: pub.subtotalNeto, refacciones: pub.subtotalRefacciones, manoObra: pub.subtotalManoObra, sheets: planificar(doc, pub).hojas.length };
};

test('10 old-model quotations: totals, IVA, discount and sheet count are identical before and after the normalizer re-reads them', async () => {
  const before = new Map(MODERN.map((q) => [q.id, snap(q)]));
  data.set(STORAGE_KEYS.quotations, JSON.stringify(OLD));
  data.delete(STORAGE_KEYS.schema); // schema version 0 forces the full normalization path
  const after = await new LocalStorageQuotationRepository().list();
  assert.equal(after.length, 10);
  for (const quotation of after) {
    if (before.has(quotation.id)) assert.deepEqual(snap(quotation), before.get(quotation.id), quotation.id);
    assert.equal('parentId' in quotation.items[0], false, 'old items never gain a parentId');
  }
  // Legacy-shape quotations keep their stored totals to the cent after normalization.
  for (const original of OLD) {
    const stored = after.find((q) => q.id === original.id);
    assert.equal(stored.total, original.total, original.id);
    assert.equal(stored.ivaAmount, original.ivaAmount, original.id);
    assert.equal(stored.subtotalNeto, original.subtotalNeto, original.id);
  }
  // Re-normalizing already normalized data changes nothing (idempotent).
  const once = data.get(STORAGE_KEYS.quotations);
  data.delete(STORAGE_KEYS.schema);
  const again = await new LocalStorageQuotationRepository().list();
  assert.equal(data.get(STORAGE_KEYS.quotations), once);
  assert.deepEqual(again.map(snap), after.map(snap));
});

test('the normalizer keeps parentId on labor lines even when another legacy quotation forces normalization', async () => {
  const quote = oldQuote(1, { parts: 1 });
  quote.items = [item('s1', 'part', 'Servicio', 1, 400), item('l1', 'labor', 'Mano de obra', 1, 150, { parentId: 's1' })];
  data.set(STORAGE_KEYS.quotations, JSON.stringify([quote, oldQuote(2, { parts: 1, legacy: true })]));
  data.delete(STORAGE_KEYS.schema);
  const list = await new LocalStorageQuotationRepository().list();
  assert.equal(list[0].items[1].parentId, 's1');
  assert.equal('parentId' in list[0].items[0], false);
});

test('old backup (format v1, no parentId) restores with identical figures; new quotations keep parentId through backup', async () => {
  data.set(STORAGE_KEYS.quotations, JSON.stringify(MODERN));
  const before = new Map(MODERN.map((q) => [q.id, snap(q)]));
  const file = serializeBackup(buildBackup(new Date('2026-11-06T12:00:00')));
  data.clear();
  applyBackup(parseBackup(file), 'replace');
  for (const quotation of await new LocalStorageQuotationRepository().list()) assert.deepEqual(snap(quotation), before.get(quotation.id), quotation.id);

  data.clear();
  const created = await new LocalStorageQuotationRepository().create({
    customer: { name: 'A', phone: '' }, vehicle: { make: 'a', model: 'b', plates: 'c' },
    items: [{ id: 's1', type: 'part', description: 'Servicio', quantity: 1, saleUnitPrice: 400 }, { id: 'l1', type: 'labor', description: 'Mano de obra', quantity: 1, saleUnitPrice: 150, parentId: 's1' }],
    laborDiscountType: 'percentage', laborDiscountValue: 0, includeVat: true, validityDays: 15, publicNotes: '',
  });
  const file2 = serializeBackup(buildBackup());
  data.clear();
  applyBackup(parseBackup(file2), 'replace');
  assert.equal((await new LocalStorageQuotationRepository().getById(created.id)).items[1].parentId, 's1');
});
