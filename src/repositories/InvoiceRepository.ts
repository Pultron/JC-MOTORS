import type { Invoice } from '../models/invoice';

export type SaveInvoiceResult = { invoice: Invoice; duplicate: boolean };

export interface InvoiceRepository {
  getAll(): Promise<Invoice[]>;
  getById(uuid: string): Promise<Invoice | undefined>;
  /** Deduplica por UUID: si ya existe devuelve la guardada con `duplicate: true` y no escribe. */
  save(invoice: Invoice): Promise<SaveInvoiceResult>;
  /** Reemplaza una factura ya guardada (p. ej. tras la revisión del usuario). */
  update(invoice: Invoice): Promise<void>;
  delete(uuid: string): Promise<void>;
}
