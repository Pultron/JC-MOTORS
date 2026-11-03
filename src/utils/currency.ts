const moneyFormat = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "MXN 1,234.50" */
export function formatMoney(amount: number): string {
  return `MXN ${moneyFormat.format(Number.isFinite(amount) ? amount : 0)}`;
}

/**
 * Normaliza texto numérico a notación con punto. El último separador es el decimal y los demás son
 * de miles ("1,234.50" y "1.234,50" dan "1234.50"). Un valor con signo negativo se descarta.
 */
function normalizeDecimal(raw: string): string {
  const text = raw.trim();
  if (text.startsWith('-')) return '';
  const cleaned = text.replace(/[^\d.,]/g, '');
  const last = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  if (last === -1) return cleaned;
  const mixed = cleaned.includes('.') && cleaned.includes(',');
  const separators = (cleaned.match(/[.,]/g) ?? []).length;
  if (!mixed && separators > 1) return cleaned.replace(/[.,]/g, '');
  return `${cleaned.slice(0, last).replace(/[.,]/g, '')}.${cleaned.slice(last + 1)}`;
}

/** Interpreta decimales con coma o punto; negativos y valores no numéricos valen 0. */
export function parseDecimal(value: string): number {
  const parsed = Number(normalizeDecimal(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Limpia lo que se escribe en un campo decimal: solo dígitos y un separador decimal con punto. */
export function sanitizeDecimalInput(value: string): string {
  return normalizeDecimal(value);
}
