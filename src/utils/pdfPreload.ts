import { scheduleWhenIdle } from './pdfAssetsCore';

/** Warms up the PDF module and its fonts/logo while the browser is idle, so opening the dialog is instant. */
export function preloadPdfWhenIdle(): void {
  scheduleWhenIdle(() => {
    void Promise.all([import('./pdfQuotation'), import('./pdfAssetsLoader').then((module) => module.loadPdfAssets())]).catch(() => {
      /* the dialog retries on demand and reports the error there */
    });
  });
}
