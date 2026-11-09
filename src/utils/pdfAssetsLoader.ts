import extraBoldUrl from '../assets/fonts/Inter_800ExtraBold.ttf?url';
import boldUrl from '../assets/fonts/Inter_700Bold.ttf?url';
import regularUrl from '../assets/fonts/Inter_400Regular.ttf?url';
import { bufferToBase64 } from './base64';
import type { PdfAssets } from './pdfAssets';

async function fetchBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar el recurso ${url}`);
  return bufferToBase64(await response.arrayBuffer());
}

/** The source PNG is ~1 MB: it is downscaled before being embedded in every PDF. */
async function loadLogo(): Promise<string | undefined> {
  try {
    const response = await fetch('/jc-motors-logo.png');
    if (!response.ok) return undefined;
    const bitmap = await createImageBitmap(await response.blob());
    const size = 400;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

let assetsPromise: Promise<PdfAssets> | undefined;

/** Loads fonts and logo once and reuses them for every PDF and for the sheet counter. */
export function loadPdfAssets(): Promise<PdfAssets> {
  assetsPromise ??= Promise.all([fetchBase64(regularUrl), fetchBase64(boldUrl), fetchBase64(extraBoldUrl), loadLogo()])
    .then(([regular, bold, extraBold, logo]) => ({ regular, bold, extraBold, ...(logo ? { logo } : {}) }))
    .catch((error) => { assetsPromise = undefined; throw error; });
  return assetsPromise;
}
