import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { jsPDF } from 'jspdf';
import { MAX_CONCEPTS, MM, planificar, formatPhone } from '../src/services/quotationLayout.ts';
import { validateQuoteForm } from '../src/services/quoteValidation.ts';
import { buildQuotationPdf } from '../src/utils/pdfQuotation.ts';
import { registerFonts } from '../src/utils/pdfAssets.ts';
import { calculateQuotationTotals, toPublicQuotation } from '../src/utils/quotation.ts';

const outDir = join(tmpdir(), 'jc-motors-pdf-tests');
mkdirSync(outDir, { recursive: true });

const b64 = (path) => readFileSync(new URL(path, import.meta.url)).toString('base64');
const assets = {
  regular: b64('../src/assets/fonts/Inter_400Regular.ttf'),
  bold: b64('../src/assets/fonts/Inter_700Bold.ttf'),
  extraBold: b64('../src/assets/fonts/Inter_800ExtraBold.ttf'),
  logo: `data:image/png;base64,${b64('../src/assets/jc-motors-logo.png')}`,
};

/** Fake measurer: ~0.55 em per character, greedy word wrap. Enough to exercise the planner deterministically. */
function fakeDoc() {
  let sizePt = 12;
  return {
    setFont() { return this; },
    setFontSize(size) { sizePt = size; return this; },
    splitTextToSize(text, widthMm) {
      const charPx = (sizePt / 0.75) * 0.55;
      const maxChars = Math.max(1, Math.floor(widthMm / MM / charPx));
      return String(text).split('\n').flatMap((paragraph) => {
        const lines = [];
        let line = '';
        for (const word of paragraph.split(' ')) {
          const next = line ? `${line} ${word}` : word;
          if (next.length > maxChars && line) { lines.push(line); line = word; } else line = next;
        }
        lines.push(line);
        return lines;
      });
    },
  };
}

function realDoc() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerFonts(doc, assets);
  return doc;
}

function quotation(count, { names, notes = '', includeVat = true } = {}) {
  const items = Array.from({ length: count }, (_, index) => {
    const type = index % 2 ? 'labor' : 'part';
    return { id: `i${index}`, type, description: names?.[index] ?? `Concepto ${index + 1}`, quantity: 1, saleUnitPrice: 100, amount: 100 };
  });
  return {
    businessName: 'JC Motors', folio: 'JC-0100', createdAt: '2026-11-03T12:00:00',
    customer: { name: 'Jose', phone: '2434213213', email: 'jose@gmail.com' },
    vehicle: { make: 'Suzuki', model: 'Jimny', year: 2023, plates: 'Q3E223231132' },
    items, laborDiscount: 0, subtotalRefacciones: 100 * count, subtotalManoObra: 0, subtotalNeto: 100 * count,
    includeVat, ivaAmount: 0, total: 100 * count, validityDays: 15, publicNotes: notes,
  };
}

test('planner: row totals, final flag and minimum rows on the last sheet', () => {
  for (const count of [1, 3, 4, 9, 10, 17, 36, 63]) {
    const plan = planificar(fakeDoc(), quotation(count));
    const total = plan.hojas.reduce((sum, sheet) => sum + sheet.filas.length, 0);
    assert.equal(total, count, `rows lost or duplicated at ${count}`);
    plan.hojas.forEach((sheet, index) => {
      assert.equal(sheet.final, index === plan.hojas.length - 1, `only the last sheet is final (${count})`);
      assert.ok(sheet.filas.length > 0, `no empty sheet (${count})`);
    });
    const last = plan.hojas.at(-1);
    if (plan.hojas.length > 1) assert.ok(last.filas.length >= 2, `last sheet needs >= 2 rows (${count})`);
    if (plan.hojas.length > 1) assert.equal(plan.modo.id, 'compact');
  }
});

test('planner: long names change density or sheet count', () => {
  const short = planificar(fakeDoc(), quotation(8));
  assert.equal(short.hojas.length, 1);
  const long = 'Reparación completa del sistema de suspensión delantera incluyendo rótulas, bujes, amortiguadores y alineación';
  const names = Array.from({ length: 8 }, (_, index) => (index < 3 ? long : `Concepto ${index + 1}`));
  const withLong = planificar(fakeDoc(), quotation(8, { names }));
  assert.ok(withLong.modo.id !== short.modo.id || withLong.hojas.length > short.hojas.length || withLong.hojas[0].altos.some((alto) => alto > 44));
});

function jc0006() {
  const names = ['Diagnóstico general', 'Cambio de aceite', 'Afinación', 'Cambio de balatas', 'Mano de obra general', 'Revisión de frenos', 'Mano de obra'];
  const prices = [300, 100, 400, 600, 1000, 1000, 500];
  const items = names.map((description, index) => ({
    id: `i${index}`, type: index === 6 ? 'labor' : 'part', description, quantity: 1, saleUnitPrice: prices[index], amount: prices[index],
  }));
  return toPublicQuotation({
    id: 'q6', folio: 'JC-0006', createdAt: '2026-11-03T12:00:00',
    customer: { name: 'jose', phone: '2434213213', email: 'jose@gmail.com' },
    vehicle: { make: 'Suzuki', model: 'Jimny', year: 2023, plates: 'Q3E223231132' },
    items, laborDiscountType: 'percentage', laborDiscountValue: 15, includeVat: false,
    validityDays: 15, publicNotes: 'VIDRIO ROTO', status: 'Pendiente',
  });
}

test('real case JC-0006: one compact sheet with totals and signature together', () => {
  const plan = planificar(realDoc(), jc0006());
  assert.equal(plan.hojas.length, 1);
  assert.equal(plan.modo.id, 'compact');
  assert.equal(plan.hojas[0].final, true);
  assert.equal(plan.hojas[0].filas.length, 7);
});

test('real case JC-0005: two concepts fit one sheet in normal mode', () => {
  const plan = planificar(realDoc(), quotation(2));
  assert.equal(plan.hojas.length, 1);
  assert.equal(plan.modo.id, 'normal');
});

function pdfText(doc, name) {
  const file = join(outDir, name);
  writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
  return { file, text: execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8' }) };
}

test('pdf content (JC-0006) and consistency with the planner', () => {
  const data = jc0006();
  const doc = buildQuotationPdf(data, assets);
  const { text } = pdfText(doc, 'JC-0006.pdf');
  for (const expected of ['Folio: JC-0006', '18 de noviembre de 2026', 'Cotización válida hasta el 18 de noviembre de 2026',
    '$3,825.00 MXN', 'Esta cotización no es un comprobante fiscal.', 'Descuento M.O. (15%)', '− $75.00', 'IVA no incluido', 'Precios sin IVA',
    'OBSERVACIONES', 'VIDRIO ROTO', '(243) 421-3213', 'Autorización del cliente']) {
    assert.ok(text.includes(expected), `missing: ${expected}`);
  }
  assert.ok(!/Refacción\s|Servicio\s+Cant|Página 1 de 1|Hoja 1 de 1/.test(text), 'no Tipo column or single-sheet numbering');
  assert.equal(doc.getNumberOfPages(), planificar(realDoc(), data).hojas.length);
});

test('pdf multi-sheet: page count equals the planner and the signature is never alone', () => {
  for (const count of [17, 36, 63]) {
    const data = quotation(count);
    const expected = planificar(realDoc(), data);
    const doc = buildQuotationPdf(data, assets);
    const { text } = pdfText(doc, `multi-${count}.pdf`);
    assert.equal(doc.getNumberOfPages(), expected.hojas.length);
    assert.ok(expected.hojas.length > 1);
    assert.ok(text.includes(`Hoja 1 de ${expected.hojas.length}`));
    const pages = text.split('\f').filter(Boolean);
    assert.ok(pages.at(-1).includes('Autorización del cliente') && /\$[\d,]+\.\d{2} MXN/.test(pages.at(-1)),'last sheet carries totals and signature');
    assert.ok(pages.slice(0, -1).every((page) => !page.includes('Autorización del cliente')), 'no earlier sheet has the signature');
  }
});

test('#017 total appears once as "$X MXN": no "MXN $", no "$$", no NaN/undefined in the PDF text', () => {
  for (const [name, data] of [['JC-0006', jc0006()], ['multi-17', quotation(17)]]) {
    const { text } = pdfText(buildQuotationPdf(data, assets), `money-${name}.pdf`);
    const totals = text.match(/\$[\d,]+\.\d{2} MXN/g) ?? [];
    assert.equal(totals.length, 1, `${name}: exactly one formal total, got ${totals.length}`);
    assert.ok(!/MXN\s*\$/.test(text), `${name}: MXN used as prefix`);
    assert.ok(!text.includes('$$'), `${name}: doubled symbol`);
    assert.ok(!/NaN|undefined/.test(text), `${name}: NaN/undefined`);
  }
});

test('#017 no source path concatenates "MXN " in front of a formatted amount', () => {
  const files = ['../src/utils/pdfQuotation.ts', '../src/services/quotationLayout.ts', '../src/components/internalControl/ProfitOverview.tsx',
    '../src/pages/HistoryPage.tsx', '../src/utils/currencyUtils.ts', '../src/utils/currency.ts', '../src/utils/quotation.ts'];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(!/['"`]MXN\s*\$?\{|['"`]MXN\s*['"`]\s*\+|`MXN \$/.test(source), `${file} concatenates "MXN " as a prefix`);
  }
});

test('phone: 10 digits are formatted, 15 digits are left as typed and rejected by the form', () => {
  assert.equal(formatPhone('6673518806'), '(667) 351-8806');
  assert.equal(formatPhone('123456789012345'), '123456789012345');
  const form = {
    customerId: '', customerName: 'Ana', phone: '123456789012345', email: '', make: 'A', model: 'B', year: '', plates: '',
    items: [{ id: '1', type: 'part', description: 'x', quantity: '1', unitPrice: '10' }], laborAmount: '', laborDiscountType: 'percentage',
    laborDiscountValue: '0', ivaEnabled: true, validityDays: '15', publicNotes: '', customerNotes: '',
  };
  const totals = calculateQuotationTotals([{ type: 'part', quantity: 1, saleUnitPrice: 10 }], 'percentage', 0, true);
  assert.ok(validateQuoteForm(form, totals).phone);
  assert.equal(validateQuoteForm({ ...form, phone: '55 1234 5678' }, totals).phone, undefined);
});

test('limit: more than 100 concepts is rejected with the split message', () => {
  const item = { id: '1', type: 'part', description: 'x', quantity: '1', unitPrice: '10' };
  const form = {
    customerId: '', customerName: 'Ana', phone: '', email: '', make: 'A', model: 'B', year: '', plates: '',
    items: Array.from({ length: MAX_CONCEPTS + 1 }, (_, index) => ({ ...item, id: String(index) })), laborAmount: '',
    laborDiscountType: 'percentage', laborDiscountValue: '0', ivaEnabled: true, validityDays: '15', publicNotes: '', customerNotes: '',
  };
  const totals = calculateQuotationTotals([], 'percentage', 0, true);
  assert.equal(validateQuoteForm(form, totals).items, 'Máximo 100 conceptos por cotización. Divídela en dos.');
});
