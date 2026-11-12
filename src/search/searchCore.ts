/** Shared text helpers for every search in the app. Pure functions, no React. */

/** Lowercase, accent-free (NFD), collapsed spaces, trimmed. */
export function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function digitsOnly(text: string | null | undefined): string {
  return (text ?? '').replace(/\D+/g, '');
}

export type QueryToken =
  | { kind: 'number'; value: string }
  | { kind: 'text'; value: string };

/**
 * Splits a query into AND tokens. Punctuation that would only get in the way
 * ("(", "\", etc.) is dropped, never interpreted. Phone-like runs such as
 * "667 351" or "(667) 351-8806" collapse into a single digits token.
 */
export function tokenize(query: string): QueryToken[] {
  interface Part { value: string; phoneish: boolean }
  const parts: Part[] = normalize(query)
    .split(' ')
    .map((part): Part => {
      const stripped = part.replace(/[()\-+.]/g, '');
      if (/^\d+$/.test(stripped)) {
        return { value: stripped, phoneish: stripped.length <= 3 || stripped !== part };
      }
      return { value: part.replace(/[^a-z0-9@._-]/g, ''), phoneish: false };
    })
    .filter((part) => part.value);

  const merged: string[] = [];
  let run: Part[] = [];
  const flush = () => {
    const joined = run.map((p) => p.value).join('');
    // "667 351" or "(667) 351-8806" are one formatted phone; short runs ("5")
    // stay folio-only tokens.
    if (run.length > 1 && joined.length >= 4) merged.push(joined);
    else merged.push(...run.map((p) => p.value));
    run = [];
  };
  for (const part of parts) {
    if (part.phoneish && /^\d+$/.test(part.value)) {
      run.push(part);
      continue;
    }
    flush();
    merged.push(part.value);
  }
  flush();

  return merged.map((value): QueryToken =>
    /^\d+$/.test(value) ? { kind: 'number', value } : { kind: 'text', value },
  );
}

export interface TokenHaystack {
  text: string;
  /** Numeric folio, when the entity has one (quotation JC-0005 -> 5, invoice Nº 0042 -> 42). */
  folioNumber: number | null;
}

/**
 * AND over every token. With a folio, a number of 1-3 digits matches only that folio so "5" does not hit
 * every phone containing a 5; anything else is a substring of the normalized haystack.
 */
export function matchesTokens(tokens: readonly QueryToken[], haystack: TokenHaystack): boolean {
  return tokens.every((token) => {
    if (token.kind === 'number' && token.value.length <= 3 && haystack.folioNumber !== null) {
      return haystack.folioNumber === Number(token.value);
    }
    return haystack.text.includes(token.value);
  });
}

/** Memoized haystacks keyed by the (immutable) record object. */
export function memoByObject<T extends object>(build: (item: T) => TokenHaystack): (item: T) => TokenHaystack {
  const cache = new WeakMap<T, TokenHaystack>();
  return (item) => {
    let hit = cache.get(item);
    if (!hit) { hit = build(item); cache.set(item, hit); }
    return hit;
  };
}
