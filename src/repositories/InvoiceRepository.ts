import type { Invoice } from '../models/invoice';
import type { ShareMedium } from '../models/quotation';

export type SaveInvoiceResult = { invoice: Invoice; duplicate: boolean };

export interface InvoiceRepository {
  getAll(): Promise<Invoice[]>;
  getById(uuid: string): Promise<Invoice | undefined>;
  /** Deduplica por UUID: si ya existe devuelve la guardada con `duplicate: true` y no escribe. */
  save(invoice: Invoice): Promise<SaveInvoiceResult>;
  /** Reemplaza una factura ya guardada (p. ej. tras la revisión del usuario). */
  update(invoice: Invoice): Promise<void>;
  delete(uuid: string): Promise<void>;
  /** Records that the invoice was shared now through `via`. Returns the updated invoice, or undefined when it does not exist. */
  markShared(uuid: string, via: ShareMedium): Promise<Invoice | undefined>;
}
