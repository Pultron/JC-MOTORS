import logoUrl from '../assets/jc-motors-logo.png?url';
import extraBoldUrl from '../assets/fonts/Inter_800ExtraBold.ttf?url';
import boldUrl from '../assets/fonts/Inter_700Bold.ttf?url';
import regularUrl from '../assets/fonts/Inter_400Regular.ttf?url';
import { bufferToBase64 } from './base64';
import { createLogoLoader, createPdfAssetsLoader } from './pdfAssetsCore';

export { warnIfLogoMissing } from './pdfAssetsCore';

export async function fetchBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar el recurso ${url}`);
  return bufferToBase64(await response.arrayBuffer());
}

const LOGO_SIZE = 400;

/** The source PNG is ~1 MB: it is downscaled before being embedded in every PDF. */
async function decodeLogo(): Promise<string> {
  const response = await fetch(logoUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement('canvas');
  canvas.width = LOGO_SIZE;
  canvas.height = LOGO_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('el lienzo 2D no está disponible');
  context.drawImage(bitmap, 0, 0, LOGO_SIZE, LOGO_SIZE);
  return canvas.toDataURL('image/png');
}

/** Single source of truth for the logo, shared by the quotation and the invoice PDFs. */
export const loadPdfLogo = createLogoLoader(decodeLogo);

/** Loads fonts and logo once and reuses them for every PDF and for the sheet counter. */
export const loadPdfAssets = createPdfAssetsLoader(
  async () => {
    const [regular, bold, extraBold] = await Promise.all([fetchBase64(regularUrl), fetchBase64(boldUrl), fetchBase64(extraBoldUrl)]);
    return { regular, bold, extraBold };
  },
  loadPdfLogo,
);
