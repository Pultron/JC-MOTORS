import type { Invoice } from '../models/invoice';
import { LocalStorageInvoiceRepository } from './LocalStorageInvoiceRepository';
import type { SaveInvoiceResult } from './InvoiceRepository';
import { confirmed } from './sqliteConfirm';

export class SqliteInvoiceRepository extends LocalStorageInvoiceRepository {
  override save(invoice: Invoice): Promise<SaveInvoiceResult> { return confirmed(super.save(invoice)); }
  override update(invoice: Invoice): Promise<void> { return confirmed(super.update(invoice)); }
  override delete(uuid: string): Promise<void> { return confirmed(super.delete(uuid)); }
}
