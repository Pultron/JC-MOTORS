import type { CustomerProfile } from '../models/quotation';
import { normalizeEmail, normalizePhone, phoneForStorage } from '../validation/fields';

/** Lowercase, accent-stripped, single-spaced: "  JUAN   Pérez " and "juan perez" are the same name. */
export function normalizeName(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es-MX');
}

export type CustomerMatch =
  | { kind: 'none' }
  /** Same name (or alias) and same phone digits or same email: the same customer, reuse silently. */
  | { kind: 'same'; customer: CustomerProfile }
  /** Same name (or alias) but another phone/email, or one of the two is empty: needs the user's decision. */
  | { kind: 'differentPhone'; customer: CustomerProfile };

export type DuplicateChoice = 'same' | 'other' | 'cancel';

export type CustomerSaveAction =
  | { action: 'create' }
  | { action: 'reuse'; customer: CustomerProfile }
  /** Reuse `customer` and replace its phone with `phone` (already in storage form). */
  | { action: 'updatePhone'; customer: CustomerProfile; phone: string }
  | { action: 'cancel' };

function sameDigits(a: string, b: string): boolean {
  return normalizePhone(a) === normalizePhone(b);
}

/** Customers whose name or any alias equals `name` (accents, casing and repeated spaces ignored). */
export function customersNamed(customers: CustomerProfile[], name: string): CustomerProfile[] {
  const key = normalizeName(name);
  if (!key) return [];
  return customers.filter((customer) => normalizeName(customer.name) === key || customer.aliases.some((alias) => normalizeName(alias) === key));
}

function sameContact(customer: CustomerProfile, phone: string, email: string): boolean {
  const mine = normalizeEmail(email);
  const theirs = normalizeEmail(customer.email ?? '');
  if (mine && theirs && mine === theirs) return true;
  // Two empty phones count as the same only when the emails do not tell them apart.
  return sameDigits(customer.phone, phone) && (normalizePhone(phone) !== '' || !(mine && theirs));
}

/** A same-name customer with the same phone or the same email wins over one with different contact data. */
export function findCustomerMatch(customers: CustomerProfile[], name: string, phone: string, email: string = ''): CustomerMatch {
  const named = customersNamed(customers, name);
  if (named.length === 0) return { kind: 'none' };
  const same = named.find((customer) => sameContact(customer, phone, email));
  if (same) return { kind: 'same', customer: same };
  return { kind: 'differentPhone', customer: named[0] };
}

/**
 * Decides what saving a new customer must do. Pure: the only side channel is `ask`, called at most once and
 * only for the "same name, different phone" case. Nothing is created or changed here; the caller applies the result.
 */
export async function resolveCustomerSave(
  customers: CustomerProfile[],
  input: { name: string; phone: string; email?: string },
  ask: (existing: CustomerProfile) => Promise<DuplicateChoice>,
): Promise<CustomerSaveAction> {
  const match = findCustomerMatch(customers, input.name, input.phone, input.email ?? '');
  if (match.kind === 'none') return { action: 'create' };
  if (match.kind === 'same') return { action: 'reuse', customer: match.customer };
  const choice = await ask(match.customer);
  if (choice === 'cancel') return { action: 'cancel' };
  if (choice === 'other') return { action: 'create' };
  // "Same person": a phone is only replaced by a phone; an empty one never erases what is stored.
  return normalizePhone(input.phone) ? { action: 'updatePhone', customer: match.customer, phone: phoneForStorage(input.phone) } : { action: 'reuse', customer: match.customer };
}
