/**
 * First-run gate. The `bienvenidaCompletada` flag lives in localStorage (key `welcomeDone`), not in SQLite:
 * it is readable synchronously after boot under Tauri and in the browser fallback, needs no new Rust command and
 * is removed by the wipe like every other app key (see classifyWipeKey).
 */
import { readRaw, removeRaw, writeRaw } from '../storage/safeStorage';
import { STORAGE_KEYS } from '../storage/storageKeys';

export type WelcomeDecision = 'welcome' | 'silent-flag' | 'app';

export interface WelcomeFacts {
  /** The completed flag is present. */
  flag: boolean;
  /** At least one quotation, customer or invoice exists. */
  hasData: boolean;
}

/** Pure decision: no flag and no data shows the welcome; no flag but data (older install) sets the flag silently. */
export function decideWelcome({ flag, hasData }: WelcomeFacts): WelcomeDecision {
  if (flag) return 'app';
  return hasData ? 'silent-flag' : 'welcome';
}

export function isWelcomeDone(): boolean {
  return readRaw(STORAGE_KEYS.welcomeDone) !== null;
}

export function markWelcomeDone(): void {
  writeRaw(STORAGE_KEYS.welcomeDone, '1');
}

export function clearWelcomeFlag(): void {
  removeRaw(STORAGE_KEYS.welcomeDone);
}

function listLength(key: string): number {
  const raw = readRaw(key);
  if (raw === null || raw.trim() === '' || raw.trim() === '[]') return 0;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    // Unreadable data is still data: never show the welcome over it.
    return 1;
  }
}

/** Quotations + customers + invoices currently stored. */
export function countBusinessRecords(): number {
  return listLength(STORAGE_KEYS.quotations) + listLength(STORAGE_KEYS.customers) + listLength(STORAGE_KEYS.invoices);
}

/** Reads the facts, applies the decision and, for an older install with data, creates the flag. Idempotent. */
export function resolveWelcomeGate(): WelcomeDecision {
  const flag = isWelcomeDone();
  if (flag) return 'app';
  const decision = decideWelcome({ flag, hasData: countBusinessRecords() > 0 });
  if (decision === 'silent-flag') {
    try { markWelcomeDone(); } catch { /* Without the flag the next start decides again the same way. */ }
  }
  return decision;
}
