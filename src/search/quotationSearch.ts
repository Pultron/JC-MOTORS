import type { Quotation } from '../models/quotation';
import { digitsOnly, matchesTokens, memoByObject, normalize, tokenize } from './searchCore';
import type { TokenHaystack } from './searchCore';

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

function build(quotation: Quotation): TokenHaystack {
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
  return { text: parts.filter(Boolean).join(' '), folioNumber: number };
}

// Quotations are replaced (never mutated) on edit, so object identity is the edit marker:
// a changed quotation gets a fresh haystack, an untouched one is reused.
export const buildHaystack = memoByObject<Quotation>(build);

export function matchesQuotation(quotation: Quotation, query: string): boolean {
  const tokens = tokenize(query);
  return tokens.length === 0 || matchesTokens(tokens, buildHaystack(quotation));
}

/** Filters keeping the incoming order. Empty query returns a copy of the same list. */
export function searchQuotations(quotations: readonly Quotation[], query: string): Quotation[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return quotations.slice();
  return quotations.filter((quotation) => matchesTokens(tokens, buildHaystack(quotation)));
}
