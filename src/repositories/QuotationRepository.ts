import type { CreateQuotationInput, Quotation, ShareMedium } from '../models/quotation';

export interface QuotationRepository {
  list(): Promise<Quotation[]>;
  getById(id: string): Promise<Quotation | undefined>;
  create(input: CreateQuotationInput): Promise<Quotation>;
  update(id: string, input: CreateQuotationInput): Promise<Quotation | undefined>;
  approve(id: string): Promise<Quotation | undefined>;
  /**
   * Pending quotations may be cancelled without a reason; approved ones need a non-blank reason (max 120 chars).
   * All-or-nothing: on any failure the quotation keeps its previous status. Resolves undefined when the status does not allow it.
   */
  cancel(id: string, reason?: string): Promise<Quotation | undefined>;
  deletePermanently(id: string): Promise<Quotation | undefined>;
  /** Records that the quotation was handed to WhatsApp/email. Allowed in any status. */
  markShared(id: string, via: ShareMedium): Promise<Quotation | undefined>;
  /** Updates only the customer's phone/email on the quotation (used when the contact is completed at share time). */
  updateCustomerContact(id: string, contact: { phone?: string; email?: string }): Promise<Quotation | undefined>;
}
