import type { CustomerProfile } from '../models/quotation';

const STORAGE_KEY = 'jc-motors:customers:v1';

export const customerService = {
  list(): CustomerProfile[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter((customer) => customer && typeof customer.id === 'string' && typeof customer.name === 'string' && Array.isArray(customer.aliases)) as CustomerProfile[];
      }
    } catch { /* El almacenamiento no está disponible o contiene datos inválidos. */ }
    return [];
  },
  save(customers: CustomerProfile[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
  },
};
