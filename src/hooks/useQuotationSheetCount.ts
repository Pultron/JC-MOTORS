import { useEffect, useState } from 'react';
import type { QuoteFormData } from '../models/quoteDraft';
import type { PublicQuotation } from '../models/quotation';
import type { QuotationTotals } from '../utils/quotation';
import { parseDecimal } from '../utils/currency';

const DEBOUNCE_MS = 150;

type Measurer = { measure: (quotation: PublicQuotation) => number };
let measurerPromise: Promise<Measurer> | undefined;

/** One throwaway jsPDF with the real fonts, so the counter measures exactly like the generator. */
function loadMeasurer(): Promise<Measurer> {
  measurerPromise ??= Promise.all([import('jspdf'), import('../utils/pdfAssetsLoader'), import('../utils/pdfAssets'), import('../services/quotationLayout')])
    .then(async ([{ jsPDF }, { loadPdfAssets }, { registerFonts }, { planificar }]) => {
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      registerFonts(doc, await loadPdfAssets());
      return { measure: (quotation: PublicQuotation) => planificar(doc, quotation).hojas.length };
    })
    .catch((error) => { measurerPromise = undefined; throw error; });
  return measurerPromise;
}

function previewQuotation(form: QuoteFormData, totals: QuotationTotals): PublicQuotation {
  const labor = parseDecimal(form.laborAmount);
  const parts = form.items
    .filter((item) => item.description.trim() || item.unitPrice.trim())
    .map((item) => {
      const quantity = parseDecimal(item.quantity);
      const saleUnitPrice = parseDecimal(item.unitPrice);
      return { id: item.id, type: item.type, description: item.description.trim(), quantity, saleUnitPrice, amount: quantity * saleUnitPrice };
    });
  return {
    businessName: 'JC Motors',
    folio: 'JC-0000',
    createdAt: new Date().toISOString(),
    customer: { name: form.customerName.trim(), phone: form.phone.trim(), ...(form.email.trim() ? { email: form.email.trim() } : {}) },
    vehicle: { make: form.make.trim(), model: form.model.trim(), ...(form.year ? { year: Number(form.year) } : {}), plates: form.plates.trim().toUpperCase() },
    items: [
      ...parts,
      ...(labor > 0 ? [{ id: 'labor', type: 'labor' as const, description: 'Mano de obra', quantity: 1, saleUnitPrice: labor, amount: labor }] : []),
    ],
    laborDiscount: totals.laborDiscount,
    ...(form.laborDiscountType === 'percentage' ? { laborDiscountPercent: Number(form.laborDiscountValue) || 0 } : {}),
    subtotalRefacciones: totals.subtotalRefacciones,
    subtotalManoObra: totals.subtotalManoObra,
    subtotalNeto: totals.subtotalNeto,
    includeVat: form.ivaEnabled,
    ivaAmount: totals.ivaAmount,
    total: totals.total,
    validityDays: Number(form.validityDays) || 15,
    publicNotes: form.publicNotes.trim(),
    customerNotes: form.customerNotes.trim(),
  };
}

/** Live number of sheets the PDF will use, computed with the same planner as the PDF generator. */
export function useQuotationSheetCount(form: QuoteFormData, totals: QuotationTotals): number | null {
  const [sheets, setSheets] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      loadMeasurer()
        .then((measurer) => { if (active) setSheets(measurer.measure(previewQuotation(form, totals))); })
        .catch(() => { if (active) setSheets(null); });
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [form, totals]);

  return sheets;
}
