import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import { jsPDF } from 'jspdf';
import { installMemoryStorage } from './memoryStorage.mjs';
import { LocalStorageQuotationRepository } from '../src/repositories/LocalStorageQuotationRepository.ts';
import { planificar } from '../src/services/quotationLayout.ts';
import { buildQuotationInput, previewPublicQuotation } from '../src/services/quotationFromForm.ts';
import { buildQuotationPdf } from '../src/utils/pdfQuotation.ts';
import { registerFonts } from '../src/utils/pdfAssets.ts';
import { toPublicQuotation } from '../src/utils/quotation.ts';

const { data } = installMemoryStorage();
beforeEach(() => data.clear());

const b64 = (path) => readFileSync(new URL(path, import.meta.url)).toString('base64');
const assets = {
  regular: b64('../src/assets/fonts/Inter_400Regular.ttf'),
  bold: b64('../src/assets/fonts/Inter_700Bold.ttf'),
  extraBold: b64('../src/assets/fonts/Inter_800ExtraBold.ttf'),
  logo: `data:image/png;base64,${b64('../src/assets/jc-motors-logo.png')}`,
};

const LONG = 'Reparación completa del sistema de suspensión delantera incluyendo rótulas, bujes, amortiguadores, alineación y balanceo con refacciones originales';

function form(count, { long = false } = {}) {
  return {
    customerId: '', customerName: 'Jose', phone: '2434213213', email: 'jose@gmail.com',
    make: 'Suzuki', model: 'Jimny', year: '2023', plates: 'Q3E223231132',
    items: Array.from({ length: count }, (_, index) => ({
      id: `i${index}`, type: index % 3 === 2 ? 'labor' : 'part',
      description: long ? `${LONG} ${index + 1}` : `Concepto ${index + 1}`,
      quantity: index % 4 === 0 ? '1.5' : String(1 + (index % 3)), unitPrice: `${100 + index * 7}.${(index * 13) % 100}`.replace(/\.(\d)$/, '.0$1'),
    })).concat([{ id: 'loose-labor', type: 'labor', description: 'Mano de obra', quantity: '1', unitPrice: '350' }]),
    laborDiscountType: 'percentage', laborDiscountValue: '10', ivaEnabled: true,
    validityDays: '15', publicNotes: long ? LONG : '', customerNotes: '',
  };
}

test('#015 preview sheet count equals the pages of the PDF built from the saved quotation', async () => {
  const measuring = new jsPDF({ unit: 'mm', format: 'a4' });
  registerFonts(measuring, assets);
  const repo = new LocalStorageQuotationRepository();
  for (const long of [false, true]) {
    for (const count of [1, 2, 3, 9, 10, 30, 100]) {
      const f = form(count, { long });
      const previewSheets = planificar(measuring, previewPublicQuotation(f)).hojas.length;
      const saved = await repo.create(buildQuotationInput(f));
      const pdf = buildQuotationPdf(toPublicQuotation(saved), assets);
      assert.equal(pdf.getNumberOfPages(), previewSheets, `${count} concepts (${long ? 'long' : 'short'} descriptions)`);
    }
  }
});

test('#015 preview totals come from the same calculation as the saved quotation', async () => {
  const repo = new LocalStorageQuotationRepository();
  const f = form(30);
  const preview = previewPublicQuotation(f);
  const saved = toPublicQuotation(await repo.create(buildQuotationInput(f)));
  for (const key of ['subtotalRefacciones', 'subtotalManoObra', 'laborDiscount', 'subtotalNeto', 'ivaAmount', 'total']) {
    assert.equal(preview[key], saved[key], key);
  }
  assert.deepEqual(preview.items.map(({ id: _id, ...rest }) => rest).slice(0, 30), saved.items.map(({ id: _id, ...rest }) => rest).slice(0, 30));
});
