import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, beforeEach } from 'node:test';
import { installMemoryStorage } from './memoryStorage.mjs';
import { CONTENT_W, FOOTER_ICON_OFFSET, FOOTER_MIN_GAP, MARGIN_X, layoutFooterContacts } from '../src/services/quotationLayout.ts';
import { DEFAULT_BUSINESS_INFO, saveBusinessInfo } from '../src/config/businessInfo.ts';
import { buildQuotationPdf } from '../src/utils/pdfQuotation.ts';

const { data } = installMemoryStorage();
beforeEach(() => data.clear());

const outDir = join(tmpdir(), 'jc-motors-pdf-tests');
mkdirSync(outDir, { recursive: true });
const b64 = (path) => readFileSync(new URL(path, import.meta.url)).toString('base64');
const assets = {
  regular: b64('../src/assets/fonts/Inter_400Regular.ttf'),
  bold: b64('../src/assets/fonts/Inter_700Bold.ttf'),
  extraBold: b64('../src/assets/fonts/Inter_800ExtraBold.ttf'),
  logo: `data:image/png;base64,${b64('../src/assets/jc-motors-logo.png')}`,
};
const RIGHT = MARGIN_X + CONTENT_W;

test('#022 layout: default widths keep the phone centred where it used to be (~330 px) on the same line', () => {
  const layout = layoutFooterContacts({ addressWidth: 168.6, phoneWidth: 96, emailWidth: 176.2 });
  assert.equal(layout.mode, 'row');
  assert.ok(Math.abs(layout.phoneX - 330) < 6, `phone x = ${layout.phoneX}`);
});

test('#022 layout: a long address pushes the phone to the line below instead of overlapping', () => {
  const layout = layoutFooterContacts({ addressWidth: 330, phoneWidth: 96, emailWidth: 176.2 });
  assert.equal(layout.mode, 'stacked');
  assert.equal(layout.scale, 1);
});

test('#022 layout: row mode never overlaps address or email, for any address width', () => {
  for (let addressWidth = 40; addressWidth <= 420; addressWidth += 5) {
    for (const emailWidth of [0, 120, 176.2, 260]) {
      const layout = layoutFooterContacts({ addressWidth, phoneWidth: 96, emailWidth });
      if (layout.mode !== 'row') continue;
      const addressEnd = MARGIN_X + FOOTER_ICON_OFFSET + addressWidth * layout.scale;
      const phoneEnd = layout.phoneX + FOOTER_ICON_OFFSET + 96 * layout.scale;
      const emailStart = emailWidth ? RIGHT - emailWidth * layout.scale - FOOTER_ICON_OFFSET : RIGHT;
      assert.ok(layout.phoneX >= addressEnd + FOOTER_MIN_GAP - 0.01 && phoneEnd <= emailStart - FOOTER_MIN_GAP + 0.01, `overlap at address ${addressWidth}, email ${emailWidth}`);
    }
  }
});

test('#022 layout: no phone, no email and extreme widths do not throw and keep a usable scale', () => {
  assert.deepEqual(layoutFooterContacts({ addressWidth: 100 }), { mode: 'row', scale: 1 });
  const extreme = layoutFooterContacts({ addressWidth: 330, phoneWidth: 96, emailWidth: 400 });
  assert.ok(extreme.scale >= 0.6 && extreme.scale <= 1);
});

function quotation() {
  return {
    businessName: 'JC Motors', folio: 'JC-0100', createdAt: '2026-11-03T12:00:00',
    customer: { name: 'Jose', phone: '2434213213', email: 'jose@gmail.com' },
    vehicle: { make: 'Suzuki', model: 'Jimny', year: 2023, plates: 'Q3E223231132' },
    items: [{ id: 'i0', type: 'part', description: 'Concepto 1', quantity: 1, saleUnitPrice: 100, amount: 100 }],
    laborDiscount: 0, subtotalRefacciones: 100, subtotalManoObra: 0, subtotalNeto: 100, includeVat: true, ivaAmount: 0, total: 100,
    validityDays: 15, publicNotes: '',
  };
}

/** Text boxes (pt) of the footer contact rows, from pdf.js. */
async function footerWords(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const height = page.getViewport({ scale: 1 }).height;
  const { items } = await page.getTextContent();
  return items
    .filter((item) => item.str.trim() && item.height > 0)
    .map((item) => ({ x0: item.transform[4], x1: item.transform[4] + item.width, y1: height - item.transform[5], y0: height - item.transform[5] - item.height, text: item.str }))
    .filter((word) => word.y1 > height * 0.9 && word.y1 < height * 0.965);
}

const overlaps = (a, b) => a.x0 < b.x1 - 0.1 && b.x0 < a.x1 - 0.1 && a.y0 < b.y1 - 0.1 && b.y0 < a.y1 - 0.1;

for (const [name, info] of [
  ['default', DEFAULT_BUSINESS_INFO],
  ['short address', { nombre: 'TALLER', telefonos: ['6671234567'], direccion: 'Av. Juárez 12', correo: 'hola@taller.mx' }],
  ['long address', { nombre: 'TALLER', telefonos: ['6671234567'], direccion: 'Boulevard Rolando Arjona Amabilis #1234\nFracc. Las Quintas Residencial, Culiacán', correo: 'atencion@tallermecanico.mx' }],
  ['long address and long email', { nombre: 'TALLER', telefonos: ['6671234567'], direccion: 'Boulevard Rolando Arjona Amabilis #1234\nFracc. Las Quintas Residencial, Culiacán', correo: 'atencion.a.clientes.taller.mecanico@gmail.com' }],
  ['no email', { nombre: 'TALLER', telefonos: ['6671234567'], direccion: 'Boulevard Rolando Arjona Amabilis #1234\nFracc. Las Quintas Residencial, Culiacán' }],
]) {
  test(`#022 PDF footer (${name}): the phone is printed and no footer text overlaps another`, async () => {
    saveBusinessInfo(info);
    const file = join(outDir, `footer-${name.replaceAll(' ', '-')}.pdf`);
    writeFileSync(file, Buffer.from(buildQuotationPdf(quotation(), assets).output('arraybuffer')));
    const words = await footerWords(file);
    assert.ok(words.some((word) => /\(\d{3}\)/.test(word.text)), 'phone is printed');
    for (let i = 0; i < words.length; i += 1) {
      for (let j = i + 1; j < words.length; j += 1) assert.ok(!overlaps(words[i], words[j]), `"${words[i].text}" overlaps "${words[j].text}"`);
    }
  });
}
