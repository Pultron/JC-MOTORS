import type { CreateQuotationInput, Quotation, ShareMedium } from '../models/quotation';

export interface QuotationRepository {
  list(): Promise<Quotation[]>;
  getById(id: string): Promise<Quotation | undefined>;
  create(input: CreateQuotationInput): Promise<Quotation>;
  update(id: string, input: CreateQuotationInput): Promise<Quotation | undefined>;
  duplicate(id: string): Promise<Quotation | undefined>;
  approve(id: string): Promise<Quotation | undefined>;
  cancel(id: string): Promise<Quotation | undefined>;
  deleteCancelled(id: string): Promise<Quotation | undefined>;
  /** Records that the quotation was handed to WhatsApp/email. Allowed in any status. */
  markShared(id: string, via: ShareMedium): Promise<Quotation | undefined>;
  /** Updates only the customer's phone/email on the quotation (used when the contact is completed at share time). */
  updateCustomerContact(id: string, contact: { phone?: string; email?: string }): Promise<Quotation | undefined>;
}
