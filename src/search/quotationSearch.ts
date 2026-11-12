import type { Quotation } from '../models/quotation';
import { digitsOnly, normalize, tokenize } from './searchCore';

interface Haystack {
  text: string;
  folioNumber: number | null;
}

// Quotations are replaced (never mutated) on edit, so object identity is the
// edit marker: a changed quotation gets a fresh haystack, an untouched one is reused.
const cache = new WeakMap<Quotation, Haystack>();

function folioVariants(folio: string): { variants: string[]; number: number | null } {
  const digits = digitsOnly(folio);
  const lower = normalize(folio);
  if (!digits) return { variants: [lower], number: null };
  const number = Number(digits);
  return {
    variants: [lower, lower.replace(/[^a-z0-9]/g, ''), digits, String(number)],
    number,
  };
}

export function buildHaystack(quotation: Quotation): Haystack {
  const cached = cache.get(quotation);
  if (cached) return cached;
  const { variants, number } = folioVariants(quotation.folio);
  const parts = [
    ...variants,
    normalize(quotation.customer?.name),
    digitsOnly(quotation.customer?.phone),
    normalize(quotation.customer?.email),
    normalize(quotation.vehicle?.make),
    normalize(quotation.vehicle?.model),
    normalize(quotation.vehicle?.year == null ? '' : String(quotation.vehicle.year)),
    normalize(quotation.vehicle?.plates),
    normalize(quotation.status),
    ...(quotation.items ?? []).map((item) => normalize(item.description)),
  ];
  const haystack: Haystack = { text: parts.filter(Boolean).join(' '), folioNumber: number };
  cache.set(quotation, haystack);
  return haystack;
}

export function matchesQuotation(quotation: Quotation, query: string): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  const haystack = buildHaystack(quotation);
  return tokens.every((token) => {
    if (token.kind === 'number' && token.value.length <= 3) {
      return haystack.folioNumber !== null && haystack.folioNumber === Number(token.value);
    }
    return haystack.text.includes(token.value);
  });
}

/** Filters keeping the incoming order. Empty query returns the same list. */
export function searchQuotations(quotations: readonly Quotation[], query: string): Quotation[] {
  if (tokenize(query).length === 0) return quotations.slice();
  return quotations.filter((quotation) => matchesQuotation(quotation, query));
}
