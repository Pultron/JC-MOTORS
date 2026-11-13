import type { CreateQuotationInput, Quotation, ShareMedium } from '../models/quotation';
import { LocalStorageQuotationRepository } from './LocalStorageQuotationRepository';
import { confirmed } from './sqliteConfirm';

/** Mismas reglas que el repositorio local; cada escritura espera la confirmación de SQLite antes de resolver. */
export class SqliteQuotationRepository extends LocalStorageQuotationRepository {
  override create(input: CreateQuotationInput): Promise<Quotation> { return confirmed(super.create(input)); }
  override update(id: string, input: CreateQuotationInput): Promise<Quotation | undefined> { return confirmed(super.update(id, input)); }
  override approve(id: string): Promise<Quotation | undefined> { return confirmed(super.approve(id)); }
  override cancel(id: string): Promise<Quotation | undefined> { return confirmed(super.cancel(id)); }
  override deleteCancelled(id: string): Promise<Quotation | undefined> { return confirmed(super.deleteCancelled(id)); }
  override markShared(id: string, via: ShareMedium): Promise<Quotation | undefined> { return confirmed(super.markShared(id, via)); }
  override updateCustomerContact(id: string, contact: { phone?: string; email?: string }): Promise<Quotation | undefined> { return confirmed(super.updateCustomerContact(id, contact)); }
}
