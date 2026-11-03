import type { Invoice } from '../models/invoice';
import type { InvoiceRepository, SaveInvoiceResult } from './InvoiceRepository';

export const INVOICES_STORAGE_KEY = 'jcmotors.invoices';

export class LocalStorageInvoiceRepository implements InvoiceRepository {
  async getAll(): Promise<Invoice[]> {
    return this.readAll();
  }

  async getById(uuid: string): Promise<Invoice | undefined> {
    return this.readAll().find((invoice) => invoice.uuid === uuid);
  }

  async save(invoice: Invoice): Promise<SaveInvoiceResult> {
    const invoices = this.readAll();
    const existing = invoices.find((entry) => entry.uuid === invoice.uuid);
    if (existing) return { invoice: existing, duplicate: true };
    this.writeAll([invoice, ...invoices]);
    return { invoice, duplicate: false };
  }

  async update(invoice: Invoice): Promise<void> {
    this.writeAll(this.readAll().map((entry) => (entry.uuid === invoice.uuid ? invoice : entry)));
  }

  async delete(uuid: string): Promise<void> {
    this.writeAll(this.readAll().filter((invoice) => invoice.uuid !== uuid));
  }

  private readAll(): Invoice[] {
    try {
      const saved = globalThis.localStorage?.getItem(INVOICES_STORAGE_KEY);
      if (!saved) return [];
      const parsed: unknown = JSON.parse(saved);
      return Array.isArray(parsed) ? (parsed as Array<Partial<Invoice>>).map(withDefaults) : [];
    } catch {
      return [];
    }
  }

  private writeAll(invoices: Invoice[]): void {
    globalThis.localStorage?.setItem(INVOICES_STORAGE_KEY, JSON.stringify(invoices));
  }
}

/** Facturas guardadas antes de existir la trazabilidad de importación. */
function withDefaults(invoice: Partial<Invoice> & { qrUrl?: string }): Invoice {
  return {
    ...(invoice.qrUrl && !invoice.urlQrOriginal ? { urlQrOriginal: invoice.qrUrl } : {}),
    origen: 'xml',
    archivoOriginal: '',
    archivoTipo: 'xml',
    archivoNombre: '',
    camposDudosos: [],
    confirmadosQr: [],
    revisadoPorUsuario: false,
    selloIncompleto: false,
    ...invoice,
  } as Invoice;
}
