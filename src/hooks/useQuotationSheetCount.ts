import { useEffect, useState } from 'react';
import type { QuoteFormData } from '../models/quoteDraft';
import type { PublicQuotation } from '../models/quotation';
import { previewPublicQuotation } from '../services/quotationFromForm';

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

/** Live number of sheets the PDF will use: same quotation builder and planner as the real PDF. */
export function useQuotationSheetCount(form: QuoteFormData): number | null {
  const [sheets, setSheets] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      loadMeasurer()
        .then((measurer) => { if (active) setSheets(measurer.measure(previewPublicQuotation(form))); })
        .catch(() => { if (active) setSheets(null); });
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [form]);

  return sheets;
}
