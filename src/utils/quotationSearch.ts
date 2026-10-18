import type { Quotation } from '../models/quotation';

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX');
}

export function matchesQuotationSearch(quotation: Quotation, search: string): boolean {
  const query = normalize(search.trim());
  if (!query) return true;
  return normalize([
    quotation.folio, quotation.customer.name, quotation.customer.phone,
    quotation.vehicle.make, quotation.vehicle.model,
    quotation.vehicle.year ?? '', quotation.vehicle.plates,
  ].join(' ')).includes(query);
}
