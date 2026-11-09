/**
 * Single module for money formatting and cent-safe rounding.
 *
 * Variants:
 *  - "display": `$1,234.56` (screens)
 *  - "pdf":     `$1,234.56` (printed sheet, plain ASCII spaces only)
 *  - "formal":  `$1,234.56 MXN` (currency code always as a SUFFIX)
 *
 * Grouping is done by hand (es-MX style: "," thousands, "." decimals) so the output never depends on
 * the ICU build, never contains U+00A0 and never prints "NaN".
 */
export type MoneyVariant = 'display' | 'pdf' | 'formal';

const NBSP = / /g;

/** Above this magnitude cents are no longer safe integers; doubles there carry no useful cents. */
const MAX_ROUNDABLE = Math.floor(Number.MAX_SAFE_INTEGER / 100);

/**
 * Rounds to 2 decimals (half away from zero).
 *
 * For normal magnitudes it keeps the exact arithmetic the app has always used for stored amounts
 * (`(x + EPSILON) * 100`), so no saved quotation total changes by a cent; a pure decimal-shift
 * rounding would differ on ~1% of half-cent products such as 0.5 × 18341.85. What it fixes:
 * negatives are rounded symmetrically (no -0, -1.005 → -1.01), and values too large for safe cents
 * (including scientific notation such as 1e21) are returned untouched instead of being corrupted
 * by the `/ 100`. Non-finite values are returned unchanged.
 */
export function roundCurrency(amount: number): number {
  if (!Number.isFinite(amount)) return amount;
  const abs = Math.abs(amount);
  if (abs > MAX_ROUNDABLE) return amount;
  const rounded = Math.round((abs + Number.EPSILON) * 100) / 100;
  return amount < 0 && rounded !== 0 ? -rounded : rounded;
}

function groupThousands(integerDigits: string): string {
  return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Plain digits for a non-negative number without exponent notation (up to 1e21+ too). */
function toPlainFixed(value: number, decimals: number): string {
  if (value < 1e21) return value.toFixed(decimals);
  return `${BigInt(Math.round(value)).toString()}.${'0'.repeat(decimals)}`;
}

/**
 * Formats an amount. `decimals` (default 2) is only meant for values that legitimately carry more
 * precision (a CFDI unit value can have up to 6); with the default the amount is rounded to cents.
 */
export function formatMoney(amount: number, variant: MoneyVariant = 'display', decimals = 2): string {
  let value = amount;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    console.warn(`formatMoney: invalid amount (${String(amount)}); showing $0.00`);
    value = 0;
  }
  const rounded = decimals === 2 ? roundCurrency(value) : value;
  const negative = rounded < 0;
  const [whole, fraction] = toPlainFixed(Math.abs(rounded), decimals).split('.');
  const digits = fraction ? `${groupThousands(whole)}.${fraction}` : groupThousands(whole);
  const isZero = !/[1-9]/.test(digits);
  const text = `${negative && !isZero ? '-' : ''}$${digits}`;
  const out = variant === 'formal' ? `${text} MXN` : text;
  return variant === 'pdf' ? out.replace(NBSP, ' ') : out;
}

/**
 * Formats a decimal that arrives as TEXT (CFDI XML). It only groups thousands and pads to at least
 * `decimals` places: it never rounds or recomputes, so invoice figures stay exactly as in the XML.
 * Returns '' for empty or non-decimal input.
 */
export function formatMoneyText(value: string, variant: MoneyVariant = 'display', decimals = 2): string {
  const text = (value ?? '').trim();
  if (!text) return '';
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) return '';
  const [, sign, whole, fraction = ''] = match;
  const body = `${groupThousands(whole)}.${fraction.padEnd(decimals, '0')}`;
  const isZero = !/[1-9]/.test(body);
  const out = `${sign && !isZero ? '-' : ''}$${body}${variant === 'formal' ? ' MXN' : ''}`;
  return variant === 'pdf' ? out.replace(NBSP, ' ') : out;
}
