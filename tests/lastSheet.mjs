import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { jsPDF } from 'jspdf';
import { MIN_LAST_SHEET_ROWS, PAGE_H, fijoUltima, planificar } from '../src/services/quotationLayout.ts';
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

const FOUR_LINES = 'Reparación completa del sistema de suspensión delantera incluyendo rótulas, bujes, amortiguadores, alineación y balanceo de las cuatro llantas con refacciones originales de agencia y garantía por escrito del taller para el cliente';
const MARKERS = { short: /Concepto \d+/g, four: /Reparación completa del sistema/g };
const NOTES = { none: '', medium: 'Observación de ejemplo. '.repeat(12), huge: 'Observación muy larga con muchos detalles del trabajo. '.repeat(60) };

function quotation(count, kind, notes = '') {
  const items = Array.from({ length: count }, (_, index) => ({
    id: `i${index}`, type: 'part', description: kind === 'four' ? FOUR_LINES : `Concepto ${index + 1}`, quantity: 1, saleUnitPrice: 100, amount: 100,
  }));
  return {
    businessName: 'JC Motors', folio: 'JC-0100', createdAt: '2026-11-03T12:00:00',
    customer: { name: 'Jose', phone: '2434213213', email: 'jose@gmail.com' },
    vehicle: { make: 'Suzuki', model: 'Jimny', year: 2023, plates: 'Q3E223231132' },
    items, laborDiscount: 0, subtotalRefacciones: 100 * count, subtotalManoObra: 0, subtotalNeto: 100 * count,
    includeVat: true, ivaAmount: 0, total: 100 * count, validityDays: 15, publicNotes: notes,
  };
}

const COUNTS = [1, 2, 3, 4, 8, 9, 10, 11, 12, 20, 100];

test('#018 planner: the last sheet always carries at least min(2, n) concept rows and fits the page', () => {
  const doc = realDoc();
  for (const kind of ['short', 'four']) {
    for (const [noteName, notes] of Object.entries(NOTES)) {
      for (let count = 1; count <= 100; count += 1) {
        const plan = planificar(doc, quotation(count, kind, notes));
        const label = `${kind}/${noteName}/${count}`;
        const last = plan.hojas.at(-1);
        assert.equal(plan.hojas.reduce((sum, sheet) => sum + sheet.filas.length, 0), count, `rows lost or duplicated: ${label}`);
        assert.ok(last.final && plan.hojas.slice(0, -1).every((sheet) => !sheet.final && sheet.filas.length > 0), `final flag: ${label}`);
        assert.ok(last.filas.length >= Math.min(MIN_LAST_SHEET_ROWS, count), `last sheet has ${last.filas.length} rows: ${label}`);
        if (plan.hojas.length > 1) {
          const used = fijoUltima(plan.blocks, plan.modo) + last.altos.reduce((sum, alto) => sum + alto, 0);
          assert.ok(used <= PAGE_H, `last sheet overflows the page by ${Math.round(used - PAGE_H)}px: ${label}`);
        }
      }
    }
  }
});

test('#018 PDFs with 1..100 concepts: page count = planner, signature only on the last page and never without concepts', () => {
  for (const kind of ['short', 'four']) {
    for (const count of COUNTS) {
      const data = quotation(count, kind);
      const plan = planificar(realDoc(), data);
      const doc = buildQuotationPdf(data, assets);
      const file = join(outDir, `last-${kind}-${count}.pdf`);
      writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
      const pages = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8' }).split('\f').filter((page) => page.trim());
      const label = `${kind}/${count}`;
      assert.equal(pages.length, plan.hojas.length, `page count = planner sheets: ${label}`);
      pages.forEach((page, index) => {
        const signed = page.includes('Autorización del cliente');
        assert.equal(signed, index === pages.length - 1, `signature only on the last page: ${label} page ${index + 1}`);
        const rows = (page.match(MARKERS[kind]) ?? []).length;
        assert.ok(rows > 0, `page ${index + 1} has no concept rows: ${label}`);
        if (signed) assert.ok(rows >= Math.min(MIN_LAST_SHEET_ROWS, count), `last page has ${rows} rows: ${label}`);
      });
    }
  }
});

test('#018 very long observations never hang the planner and are cut with an ellipsis only when needed', () => {
  const doc = realDoc();
  const plan = planificar(doc, quotation(30, 'short', NOTES.huge));
  assert.ok(plan.blocks.observationLines.at(-1).endsWith('…'), 'huge observations are cut');
  assert.ok(plan.hojas.at(-1).filas.length >= MIN_LAST_SHEET_ROWS);
  const medium = planificar(doc, quotation(30, 'short', NOTES.medium));
  assert.ok(!medium.blocks.observationLines.at(-1).endsWith('…'), 'normal observations are printed whole');
  assert.ok(planificar(doc, quotation(1, 'short', NOTES.huge)).hojas.length >= 1);
});
