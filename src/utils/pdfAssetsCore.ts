import type { PdfAssets } from './pdfAssets';

export interface PdfFonts { regular: string; bold: string; extraBold: string }
export interface LogoResult { logo?: string; error?: string }

export const LOGO_MISSING_TITLE = 'No se pudo cargar el logo; el PDF se generó sin él';

/** Memoizes a loader but forgets a rejected attempt, so a transient failure can be retried. */
export function memoizeUntilFailure<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => {
    promise ??= load().catch((error) => {
      promise = undefined;
      throw error;
    });
    return promise;
  };
}

/**
 * The logo is optional: a failure is logged and reported in the result, never thrown, and never cached
 * (the next PDF tries again). A successful decode happens once per session.
 */
export function createLogoLoader(decode: () => Promise<string>, log: (message: string, cause: unknown) => void = console.error): () => Promise<LogoResult> {
  const decodeOnce = memoizeUntilFailure(decode);
  return async () => {
    try {
      return { logo: await decodeOnce() };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      log(`No se pudo cargar el logo de JC Motors: ${error}`, cause);
      return { error };
    }
  };
}

/** Fonts and logo are loaded and decoded once per session; the same promise serves every PDF. */
export function createPdfAssetsLoader(loadFonts: () => Promise<PdfFonts>, loadLogo: () => Promise<LogoResult>): () => Promise<PdfAssets> {
  const fonts = memoizeUntilFailure(loadFonts);
  return async () => {
    const [loadedFonts, logo] = await Promise.all([fonts(), loadLogo()]);
    return { ...loadedFonts, ...(logo.logo ? { logo: logo.logo } : {}), ...(logo.error ? { logoError: logo.error } : {}) };
  };
}

/** Tells the user (once per PDF) when the logo had to be left out. */
export function warnIfLogoMissing(result: { logoError?: string }, toast: { warning: (input: { title: string }) => void }): void {
  if (result.logoError) toast.warning({ title: LOGO_MISSING_TITLE });
}

interface IdleHost {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => unknown;
  setTimeout: (callback: () => void, ms: number) => unknown;
}

/** Runs a task when the browser is idle (requestIdleCallback), falling back to a short timeout. */
export function scheduleWhenIdle(task: () => void, host: IdleHost = globalThis as unknown as IdleHost): void {
  if (typeof host.requestIdleCallback === 'function') host.requestIdleCallback(task, { timeout: 5000 });
  else host.setTimeout(task, 1500);
}
