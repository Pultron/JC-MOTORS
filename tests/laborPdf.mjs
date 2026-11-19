import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { jsPDF } from 'jspdf';
import {
  COMPACT, MIN_LAST_SHEET_ROWS, NORMAL, PAGE_H, altoFila, describe, fijoIntermedia, fijoPrimera, fijoUltima, fijoUnaHoja, groupRows, planificar,
} from '../src/services/quotationLayout.ts';
import { registerFonts } from '../src/utils/pdfAssets.ts';
import { buildQuotationPdf } from '../src/utils/pdfQuotation.ts';

const outDir = join(tmpdir(), 'jc-motors-pdf-tests');
mkdirSync(outDir, { recursive: true });

const b64 = (path) => readFileSync(new URL(path, import.meta.url)).toString('base64');
const assets = {
  regular: b64('../src/assets/fonts/Inter_400Regular.ttf'),
  bold: b64('../src/assets/fonts/Inter_700Bold.ttf'),
  extraBold: b64('../src/assets/fonts/Inter_800ExtraBold.ttf'),
  logo: `data:image/png;base64,${b64('../src/assets/jc-motors-logo.png')}`,
};
const realDoc = () => { const doc = new jsPDF({ unit: 'mm', format: 'a4' }); registerFonts(doc, assets); return doc; };
const sum = (values) => values.reduce((total, value) => total + value, 0);

const LONG = 'Reparación completa del sistema de suspensión delantera incluyendo rótulas, bujes, amortiguadores, alineación y balanceo de las cuatro llantas con refacciones originales de agencia y garantía por escrito del taller para el cliente';

/** `services` services, each followed by its own labor line (or not, per `withLabor`), then `loose` loose labor rows at the end. */
function quotation({ services, withLabor = () => true, long = false, loose = 0, notes = '' }) {
  const items = [];
  for (let i = 0; i < services; i += 1) {
    items.push({ id: `s${i}`, type: 'part', description: long ? `${LONG} ${i + 1}` : `Servicio ${i + 1}`, quantity: 1, saleUnitPrice: 100, amount: 100 });
    if (withLabor(i)) items.push({ id: `l${i}`, type: 'labor', description: 'Mano de obra', quantity: 1, saleUnitPrice: 50, amount: 50, parentId: `s${i}` });
  }
  for (let i = 0; i < loose; i += 1) items.push({ id: `x${i}`, type: 'labor', description: 'Mano de obra', quantity: 1, saleUnitPrice: 70, amount: 70 });
  const parts = items.filter((item) => item.type === 'part').length * 100;
  const labor = items.filter((item) => item.type === 'labor').reduce((total, item) => total + item.amount, 0);
  return {
    businessName: 'JC Motors', folio: 'JC-0100', createdAt: '2026-11-03T12:00:00',
    customer: { name: 'Jose', phone: '2434213213', email: 'jose@gmail.com' },
    vehicle: { make: 'Suzuki', model: 'Jimny', year: 2023, plates: 'Q3E223231132' },
    items, laborDiscount: 0, subtotalRefacciones: parts, subtotalManoObra: labor, subtotalNeto: parts + labor,
    includeVat: true, ivaAmount: 0, total: parts + labor, validityDays: 15, publicNotes: notes,
  };
}

/** The row-by-row planner as it was before per-service labor: the reference old quotations must still match. */
function referencePlan(doc, data) {
  const items = data.items;
  for (const mode of [NORMAL, COMPACT]) {
    const blocks = describe(doc, data, mode);
    const altos = items.map((item) => altoFila(doc, item.description, mode));
    if (fijoUnaHoja(blocks, mode) + sum(altos) <= PAGE_H) return [items.length];
  }
  const mode = COMPACT;
  const altos = items.map((item) => altoFila(doc, item.description, mode));
  const minLast = Math.min(MIN_LAST_SHEET_ROWS, items.length);
  const blocks = describe(doc, data, mode, sum([...altos].sort((a, b) => b - a).slice(0, minLast)));
  const capUltima = PAGE_H - fijoUltima(blocks, mode);
  const sheets = [];
  let i = 0;
  while (true) {
    if (altos.length - i <= minLast || sum(altos.slice(i)) <= capUltima) { sheets.push(altos.length - i); break; }
    const cap = PAGE_H - (sheets.length === 0 ? fijoPrimera(blocks, mode) : fijoIntermedia(blocks, mode));
    let n = 0;
    let used = 0;
    while (i + n < altos.length && used + altos[i + n] <= cap) used += altos[i + n++];
    n = Math.max(1, Math.min(n, altos.length - i - minLast));
    sheets.push(n);
    i += n;
  }
  return sheets;
}

function assertNeverSplits(plan, label) {
  const total = plan.hojas.reduce((count, sheet) => count + sheet.filas.length, 0);
  assert.ok(total > 0, label);
  plan.hojas.forEach((sheet, index) => {
    const rows = sheet.filas;
    assert.ok(rows.length > 0, `empty sheet ${index + 1}: ${label}`);
    const first = rows[0];
    assert.ok(!(first.type === 'labor' && first.parentId), `sheet ${index + 1} starts with a labor line detached from its service: ${label}`);
    rows.forEach((row, rowIndex) => {
      if (row.type === 'labor' && row.parentId) assert.equal(rows[rowIndex - 1]?.id, row.parentId, `labor separated from its service: ${label}`);
    });
  });
}

test('planner: a service and its labor are never split, for 1, 2 and 3 sheets and every size in between', () => {
  const doc = realDoc();
  const seen = new Set();
  for (const long of [false, true]) {
    for (let services = 1; services <= 50; services += 1) {
      for (const pattern of ['all', 'alternate', 'none-first']) {
        const withLabor = pattern === 'all' ? () => true : pattern === 'alternate' ? (i) => i % 2 === 0 : (i) => i > 0;
        const data = quotation({ services, withLabor, long });
        const plan = planificar(doc, data);
        const label = `${services} services/${pattern}/${long ? 'long' : 'short'}`;
        assertNeverSplits(plan, label);
        seen.add(plan.hojas.length);
        const last = plan.hojas.at(-1);
        assert.ok(last.final && last.filas.length >= 1, `last sheet is never only totals and signature: ${label}`);
        // At least two rows with the totals, unless the last block is a single service+labor pair that cannot be split.
        const lastGroupSize = groupRows(data.items).at(-1);
        assert.ok(last.filas.length >= Math.min(MIN_LAST_SHEET_ROWS, data.items.length) || lastGroupSize.end - lastGroupSize.start === 1, `last sheet rows: ${label}`);
        if (plan.hojas.length > 1) assert.ok(fijoUltima(plan.blocks, plan.modo) + sum(last.altos) <= PAGE_H, `last sheet overflows: ${label}`);
        plan.hojas.slice(0, -1).forEach((sheet) => assert.ok(sum(sheet.altos) <= PAGE_H, label));
      }
    }
  }
  for (const sheets of [1, 2, 3]) assert.ok(seen.has(sheets), `no case produced ${sheets} sheets`);
});

test('planner: old quotations (loose labor, no parentId) get exactly the sheets they got before', () => {
  const doc = realDoc();
  for (const long of [false, true]) {
    for (let services = 1; services <= 100; services += 3) {
      for (const loose of [0, 1, 2]) {
        const data = quotation({ services, withLabor: () => false, long, loose });
        const plan = planificar(doc, data);
        assert.deepEqual(plan.hojas.map((sheet) => sheet.filas.length), referencePlan(doc, data), `${services}+${loose} loose/${long ? 'long' : 'short'}`);
      }
    }
  }
});

test('planner: grouping only joins a labor line to the service printed right before it', () => {
  const rows = [
    { id: 'a', type: 'part' }, { id: 'l', type: 'labor', parentId: 'a' }, { id: 'b', type: 'part' },
    { id: 'o', type: 'labor', parentId: 'gone' }, { id: 'x', type: 'labor' },
  ];
  assert.deepEqual(groupRows(rows), [{ start: 0, end: 2 }, { start: 2, end: 3 }, { start: 3, end: 4 }, { start: 4, end: 5 }]);
});

test('PDF: the pair is printed together, page count follows the planner, signature only on the last page', () => {
  for (const [name, services, long] of [['1 sheet', 3, false], ['2 sheets', 14, false], ['3 sheets', 24, true]]) {
    const data = quotation({ services, long, notes: 'Observación de ejemplo.' });
    const plan = planificar(realDoc(), data);
    const doc = buildQuotationPdf(data, assets);
    const file = join(outDir, `labor-${services}-${long ? 'long' : 'short'}.pdf`);
    writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
    const pages = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8' }).split('\f').filter((page) => page.trim());
    assert.equal(pages.length, plan.hojas.length, `${name}: page count = planner sheets`);
    pages.forEach((page, index) => {
      assert.equal(page.includes('Autorización del cliente'), index === pages.length - 1, `${name}: signature only on the last page`);
      const services_ = (page.match(/Servicio \d+|Reparación completa/g) ?? []).length;
      const labor = (page.match(/Mano de obra/g) ?? []).length - (index === pages.length - 1 ? 1 : 0); // the totals box also says "Mano de obra"
      assert.equal(labor, services_, `${name}: page ${index + 1} prints each service's labor on the same page`);
    });
  }
});

test('PDF: an old quotation with loose labor still builds and prints that row at the end', () => {
  const data = quotation({ services: 4, withLabor: () => false, loose: 1 });
  const doc = buildQuotationPdf(data, assets);
  const file = join(outDir, 'labor-old-loose.pdf');
  writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  const text = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
  assert.ok(text.indexOf('Servicio 4') < text.indexOf('M.O.'), 'loose labor comes after the last service');
});
