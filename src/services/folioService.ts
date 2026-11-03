const CLAVE_FOLIO_FACTURA = 'jcmotors.folioConsecutivo';

/** Consecutivo de facturas: se persiste ANTES de devolverlo y nunca retrocede, ni al borrar. */
export function siguienteFolio(): number {
  const actual = parseInt(localStorage.getItem(CLAVE_FOLIO_FACTURA) ?? '0', 10);
  const nuevo = (Number.isFinite(actual) ? actual : 0) + 1;
  localStorage.setItem(CLAVE_FOLIO_FACTURA, String(nuevo));
  return nuevo;
}

/** Garantiza que el contador no quede por debajo de un folio ya asignado (migración de registros). */
export function asegurarContadorMinimo(minimo: number): void {
  const actual = parseInt(localStorage.getItem(CLAVE_FOLIO_FACTURA) ?? '0', 10);
  if (!Number.isFinite(actual) || actual < minimo) localStorage.setItem(CLAVE_FOLIO_FACTURA, String(minimo));
}

export const formatearFolio = (n: number): string => String(n).padStart(4, '0');

export const SAVED_DRAFTS_KEY = 'jc-motors:quote-drafts:v1';

export function nextFolio(folios: string[]): string {
  const highest = folios.reduce((value, folio) => Math.max(value, Number(/^JC-(\d+)$/.exec(folio)?.[1] ?? 0)), 0);
  return `JC-${String(highest + 1).padStart(4, '0')}`;
}

export function reservedDraftFolios(): string[] {
  try {
    const saved = localStorage.getItem(SAVED_DRAFTS_KEY);
    const drafts: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(drafts) ? drafts.map((draft) => draft?.folio).filter((folio): folio is string => typeof folio === 'string') : [];
  } catch {
    return [];
  }
}
