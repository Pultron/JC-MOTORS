import { PHONE_DIGITS, normalizePhone, sanitizeSingleLine } from './fields';

const countDigits = (text: string) => text.replace(/\D/g, '').length;

/** Progressive mask: "6" -> "(6", "6673" -> "(667) 3", "6673518806" -> "(667) 351-8806". */
export function formatPhoneDigits(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, PHONE_DIGITS);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Caret index placed right after the n-th digit of `formatted` (0 when n is 0). */
export function caretAfterDigits(formatted: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) {
      seen += 1;
      if (seen === n) return i + 1;
    }
  }
  return formatted.length;
}

export type PhoneEditKind = 'backward' | 'forward' | 'other';
export interface PhoneEdit { value: string; caret: number }

/**
 * Resolves one edit of a live-formatted phone field.
 * `prev` is the value before the edit, `next` the raw DOM value after it and `caret` the DOM caret after it.
 * Deleting only a format symbol ("(", ")", " ", "-") removes the neighbouring digit instead, so Backspace never stalls.
 */
export function editPhone(prev: string, next: string, caret: number, kind: PhoneEditKind = 'other'): PhoneEdit {
  let text = next;
  let pos = Math.min(Math.max(caret, 0), next.length);
  if (kind !== 'other' && next.length < prev.length && countDigits(next) === countDigits(prev)) {
    if (kind === 'backward') {
      for (let i = pos - 1; i >= 0; i -= 1) {
        if (/\d/.test(text[i])) { text = text.slice(0, i) + text.slice(i + 1); pos = i; break; }
      }
    } else {
      for (let i = pos; i < text.length; i += 1) {
        if (/\d/.test(text[i])) { text = text.slice(0, i) + text.slice(i + 1); break; }
      }
    }
  }
  let digits = text.replace(/\D/g, '');
  let before = countDigits(text.slice(0, pos));
  if (digits.length > PHONE_DIGITS) {
    const stripped = normalizePhone(text);
    if (stripped.length === PHONE_DIGITS) { digits = stripped; before = PHONE_DIGITS; } // Pasted "+52 667 351 8806".
    else digits = digits.slice(0, PHONE_DIGITS);
  }
  const value = formatPhoneDigits(digits);
  return { value, caret: caretAfterDigits(value, Math.min(before, digits.length)) };
}

const NAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

/**
 * "maria de la luz" -> "Maria de la Luz". Only meant for text the user just edited; it never adds or removes accents.
 * Particles stay lowercase unless they open the name.
 */
export function titleCaseName(text: string): string {
  return sanitizeSingleLine(text).split(' ').filter(Boolean).map((word, index) => {
    const lower = word.toLocaleLowerCase('es-MX');
    if (index > 0 && NAME_PARTICLES.has(lower)) return lower;
    return lower.replace(/(^|[-'’])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toLocaleUpperCase('es-MX'));
  }).join(' ');
}
