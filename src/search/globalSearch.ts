import type { CustomerProfile, Quotation } from '../models/quotation';
import type { Invoice } from '../models/invoice';
import { formatMoney } from '../utils/money';
import { formatearFolio, formatMoney as formatInvoiceMoney } from '../utils/invoiceFormat';
import { calculateQuotationTotals } from '../utils/quotation';
import { formatPhone } from '../validation/fields';
import { searchQuotations } from './quotationSearch';
import { digitsOnly, matchesTokens, memoByObject, normalize, tokenize } from './searchCore';
import type { TokenHaystack } from './searchCore';

export type ResultKind = 'quotation' | 'customer' | 'invoice';

export interface GlobalResult {
  /** Unique across groups; also the DOM id suffix of the option. */
  key: string;
  kind: ResultKind;
  title: string;
  subtitle: string;
  trailing: string;
  /** Router location that opens this entity. */
  to: string;
}

export interface ResultGroup {
  kind: ResultKind;
  title: string;
  results: GlobalResult[];
  total: number;
  /** "Ver todos" destination with the query already applied. */
  seeAll: string;
}

export interface SearchData {
  quotations: readonly Quotation[];
  customers: readonly CustomerProfile[];
  invoices: readonly Invoice[];
}

export const MAX_PER_GROUP = 5;

// ---------- customers ----------

const customerHaystack = memoByObject<CustomerProfile>((customer): TokenHaystack => ({
  text: [normalize(customer.name), ...customer.aliases.map(normalize), digitsOnly(customer.phone), normalize(customer.email)].filter(Boolean).join(' '),
  folioNumber: null,
}));

/** Plates of every vehicle a customer has been quoted for (customers store no vehicles themselves). */
export function platesByCustomer(quotations: readonly Quotation[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const quotation of quotations) {
    const plates = quotation.vehicle?.plates?.trim();
    if (!quotation.customerId || !plates) continue;
    const list = result.get(quotation.customerId) ?? [];
    if (!list.some((entry) => normalize(entry) === normalize(plates))) list.push(plates);
    result.set(quotation.customerId, list);
  }
  return result;
}

export function searchCustomers(customers: readonly CustomerProfile[], query: string, plates: ReadonlyMap<string, string[]> = new Map()): CustomerProfile[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return customers.slice();
  return customers.filter((customer) => {
    const base = customerHaystack(customer);
    const extra = (plates.get(customer.id) ?? []).map(normalize).join(' ');
    return matchesTokens(tokens, { text: `${base.text} ${extra}`, folioNumber: null });
  });
}

// ---------- invoices ----------

const invoiceHaystack = memoByObject<Invoice>((invoice): TokenHaystack => ({
  text: [
    formatearFolio(invoice.folio), String(invoice.folio), `n ${formatearFolio(invoice.folio)}`,
    normalize(invoice.uuid), normalize(invoice.serieCSD),
    normalize(invoice.emisor?.nombre), normalize(invoice.emisor?.rfc),
    normalize(invoice.receptor?.nombre), normalize(invoice.receptor?.rfc),
    normalize(invoice.total),
    ...(invoice.conceptos ?? []).map((concepto) => normalize(concepto.descripcion)),
  ].filter(Boolean).join(' '),
  folioNumber: invoice.folio,
}));

export function searchInvoices(invoices: readonly Invoice[], query: string): Invoice[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return invoices.slice();
  // "Nº 0042" / "n 42": the "nº" marker is only a label, never a required token.
  const cleaned = tokens.filter((token) => !(token.kind === 'text' && /^n[o°º]?$/.test(token.value)));
  const effective = cleaned.length > 0 ? cleaned : tokens;
  return invoices.filter((invoice) => matchesTokens(effective, invoiceHaystack(invoice)));
}

// ---------- aggregate ----------

const vehicleLabel = (quotation: Quotation) => [quotation.vehicle?.make, quotation.vehicle?.model, quotation.vehicle?.year].filter(Boolean).join(' ');

function quotationResult(quotation: Quotation): GlobalResult {
  const { total } = calculateQuotationTotals(quotation.items, quotation.laborDiscountType, quotation.laborDiscountValue, quotation.includeVat);
  return {
    key: `quotation-${quotation.id}`,
    kind: 'quotation',
    title: `${quotation.folio} · ${quotation.customer.name}`,
    subtitle: vehicleLabel(quotation),
    trailing: formatMoney(total),
    to: `/cotizaciones/${quotation.id}`,
  };
}

function customerResult(customer: CustomerProfile, plates: ReadonlyMap<string, string[]>): GlobalResult {
  const detail = [formatPhone(customer.phone), customer.email, (plates.get(customer.id) ?? []).join(', ')].filter(Boolean).join(' · ');
  return { key: `customer-${customer.id}`, kind: 'customer', title: customer.name, subtitle: detail, trailing: '', to: `/clientes?cliente=${encodeURIComponent(customer.id)}` };
}

function invoiceResult(invoice: Invoice): GlobalResult {
  return {
    key: `invoice-${invoice.uuid}`,
    kind: 'invoice',
    title: `Nº ${formatearFolio(invoice.folio)} · ${invoice.receptor.nombre}`,
    subtitle: `${invoice.emisor.nombre} → ${invoice.receptor.nombre} · ${invoice.uuid.slice(0, 8)}…${invoice.uuid.slice(-8)}`,
    trailing: formatInvoiceMoney(invoice.total),
    to: `/facturas?uuid=${encodeURIComponent(invoice.uuid)}`,
  };
}

const seeAllLink = (path: string, query: string) => `${path}?q=${encodeURIComponent(query.trim())}`;

/** Groups with matches only, in the fixed order quotations → customers → invoices. An empty query returns no groups. */
export function searchAll(data: SearchData, query: string): ResultGroup[] {
  if (tokenize(query).length === 0) return [];
  const groups: ResultGroup[] = [];

  const quotations = searchQuotations(data.quotations, query);
  if (quotations.length > 0) {
    groups.push({ kind: 'quotation', title: 'Cotizaciones', total: quotations.length, results: quotations.slice(0, MAX_PER_GROUP).map(quotationResult), seeAll: seeAllLink('/historial', query) });
  }
  const plates = platesByCustomer(data.quotations);
  const customers = searchCustomers(data.customers, query, plates);
  if (customers.length > 0) {
    groups.push({ kind: 'customer', title: 'Clientes', total: customers.length, results: customers.slice(0, MAX_PER_GROUP).map((customer) => customerResult(customer, plates)), seeAll: seeAllLink('/clientes', query) });
  }
  const invoices = searchInvoices(data.invoices, query);
  if (invoices.length > 0) {
    groups.push({ kind: 'invoice', title: 'Facturas', total: invoices.length, results: invoices.slice(0, MAX_PER_GROUP).map(invoiceResult), seeAll: seeAllLink('/facturas', query) });
  }
  return groups;
}

/** Arrow-key movement over the flattened results; wraps at both ends. */
export function moveActive(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}
