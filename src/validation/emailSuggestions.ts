/**
 * Pure logic behind the email domain suggestions (EmailInput). No DOM, no React: everything here is testable with node:test.
 * Rule of the feature: the text is NEVER changed automatically; a suggestion only applies when the user accepts it.
 */

export const EMAIL_DOMAINS: readonly string[] = [
  'gmail.com', 'hotmail.com', 'outlook.com', 'outlook.es', 'yahoo.com',
  'yahoo.com.mx', 'live.com', 'icloud.com', 'msn.com', 'prodigy.net.mx',
];

/** Typo detection only runs when the typed domain is at most this far from a listed one. */
export const MAX_TYPO_DISTANCE = 2;
/** Shorter provider names ("me", "mac", "qq") are too close to listed ones by chance, so they are never flagged as typos. */
export const MIN_TYPO_LABEL_LENGTH = 4;

export interface Suggestion {
  /** complete: the typed text is the start of a listed domain. typo: the typed domain is close to a listed one. */
  kind: 'complete' | 'typo';
  domain: string;
}

/** Levenshtein distance (insert, delete, substitute). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

/** Splits "juan@gm" into the part up to and including "@" and the domain being typed. Null when there is nothing to suggest on. */
function splitAtDomain(text: string): { head: string; domain: string } | null {
  const at = text.indexOf('@');
  if (at <= 0 || text.indexOf('@', at + 1) !== -1 || /\s/.test(text)) return null;
  return { head: text.slice(0, at + 1), domain: text.slice(at + 1).toLowerCase() };
}

/** Listed domains that start with what follows the "@". A fully typed listed domain yields nothing. */
export function suggestDomains(text: string, domains: readonly string[] = EMAIL_DOMAINS): string[] {
  const parts = splitAtDomain(text);
  if (!parts || domains.includes(parts.domain)) return [];
  return domains.filter((domain) => domain.startsWith(parts.domain));
}

/** The listed domain closest to the typed one (distance <= 2), or null. A listed domain never has a "closest". */
export function closestDomain(typed: string, domains: readonly string[] = EMAIL_DOMAINS): string | null {
  const domain = typed.toLowerCase();
  if (domains.includes(domain)) return null;
  const label = domain.split('.')[0];
  if (label.length < MIN_TYPO_LABEL_LENGTH || !domain.includes('.')) return null;
  let best: string | null = null;
  let bestDistance = MAX_TYPO_DISTANCE + 1;
  for (const candidate of domains) {
    const distance = editDistance(domain, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Everything the popover shows for the current text: completions first; a typo hint only when nothing completes. */
export function buildSuggestions(text: string, domains: readonly string[] = EMAIL_DOMAINS): Suggestion[] {
  const completions = suggestDomains(text, domains);
  if (completions.length > 0) return completions.map((domain) => ({ kind: 'complete', domain }));
  const parts = splitAtDomain(text);
  const typo = parts ? closestDomain(parts.domain, domains) : null;
  return typo ? [{ kind: 'typo', domain: typo }] : [];
}

/** The text with the typed domain replaced by the accepted one. The caret goes to the end of the result. */
export function applySuggestion(text: string, suggestion: Suggestion): string {
  const parts = splitAtDomain(text);
  return parts ? parts.head + suggestion.domain : text;
}

// ---- Popover state -----------------------------------------------------------------------------

export interface SuggestState {
  /** Index of the highlighted suggestion; -1 means none (a typo hint is never highlighted by default). */
  active: number;
  /** Text for which Escape closed the popover; it stays closed until the text changes. */
  dismissedText: string | null;
}

export const initialSuggestState: SuggestState = { active: -1, dismissedText: null };

const defaultActive = (items: readonly Suggestion[]): number => (items[0]?.kind === 'complete' ? 0 : -1);

/** State after the text changed: highlight resets and a dismissal no longer applies. */
export function onTextChange(items: readonly Suggestion[]): SuggestState {
  return { active: defaultActive(items), dismissedText: null };
}

export function isOpen(state: SuggestState, text: string, items: readonly Suggestion[]): boolean {
  return items.length > 0 && state.dismissedText !== text;
}

export interface SuggestKeyInput {
  key: string;
  shiftKey?: boolean;
  /** KeyboardEvent.isComposing. */
  isComposing?: boolean;
  /** Legacy IME marker (229) sent by some webviews while composing. */
  keyCode?: number;
}

export interface SuggestKeyResult {
  state: SuggestState;
  /** Set when the key accepted a suggestion; the caller applies it. */
  accept: Suggestion | null;
  /** The caller must call preventDefault (so Enter does not submit the form and Tab does not move focus). */
  preventDefault: boolean;
  /** The caller must stop propagation (Escape closing the popover must not reach a dialog or page handler). */
  stopPropagation: boolean;
}

/** Keyboard behaviour: arrows move, Enter accepts, Tab accepts only an active suggestion, Escape closes. */
export function handleSuggestKey(state: SuggestState, input: SuggestKeyInput, text: string, items: readonly Suggestion[]): SuggestKeyResult {
  const idle: SuggestKeyResult = { state, accept: null, preventDefault: false, stopPropagation: false };
  if (input.isComposing || input.keyCode === 229 || !isOpen(state, text, items)) return idle;
  const activeItem = state.active >= 0 && state.active < items.length ? items[state.active] : null;
  switch (input.key) {
    case 'ArrowDown':
      return { ...idle, state: { ...state, active: state.active < 0 ? 0 : (state.active + 1) % items.length }, preventDefault: true };
    case 'ArrowUp':
      return { ...idle, state: { ...state, active: state.active <= 0 ? items.length - 1 : state.active - 1 }, preventDefault: true };
    case 'Enter':
      return activeItem ? { ...idle, accept: activeItem, preventDefault: true } : idle;
    case 'Tab':
      return activeItem && !input.shiftKey ? { ...idle, accept: activeItem, preventDefault: true } : idle;
    case 'Escape':
      return { ...idle, state: { ...state, dismissedText: text }, preventDefault: true, stopPropagation: true };
    default:
      return idle;
  }
}
