import type { Invoice } from '../models/invoice';
import type { InvoiceRepository, SaveInvoiceResult } from './InvoiceRepository';

import { quarantineCorrupt, readGuardedJson } from '../storage/corruptBackup';
import type { GuardedReadOptions } from '../storage/corruptBackup';
import { readRaw, writeRaw } from '../storage/safeStorage';
import { STORAGE_KEYS } from '../storage/storageKeys';

export const INVOICES_STORAGE_KEY = STORAGE_KEYS.invoices;
const DAMAGED: GuardedReadOptions = {
  backupName: 'invoices',
  damagedMessage: 'Las facturas estaban dañadas; se guardó una copia de respaldo',
};

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
    const result = readGuardedJson(INVOICES_STORAGE_KEY, DAMAGED, (value): value is Array<Partial<Invoice>> => Array.isArray(value));
    if (result.status !== 'ok') return [];
    try {
      return result.value.map(withDefaults);
    } catch {
      const raw = readRaw(INVOICES_STORAGE_KEY);
      if (raw !== null) quarantineCorrupt(INVOICES_STORAGE_KEY, raw, DAMAGED);
      return [];
    }
  }

  private writeAll(invoices: Invoice[]): void {
    writeRaw(INVOICES_STORAGE_KEY, JSON.stringify(invoices));
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
