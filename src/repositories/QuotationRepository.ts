import type { CreateQuotationInput, Quotation } from '../models/quotation';

export interface QuotationRepository {
  list(): Promise<Quotation[]>;
  getById(id: string): Promise<Quotation | undefined>;
  create(input: CreateQuotationInput): Promise<Quotation>;
  update(id: string, input: CreateQuotationInput): Promise<Quotation | undefined>;
  duplicate(id: string): Promise<Quotation | undefined>;
  approve(id: string): Promise<Quotation | undefined>;
  cancel(id: string): Promise<Quotation | undefined>;
  deleteCancelled(id: string): Promise<Quotation | undefined>;
}
