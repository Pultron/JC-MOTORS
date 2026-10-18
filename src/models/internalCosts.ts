import type { PaymentMethod } from './quotation';

export type InternalCaptureStatus = 'pending' | 'incomplete' | 'complete';

export interface InternalItemCost {
  quoteItemId: string;
  actualUnitCostCents: number | null;
}

export interface AdditionalExpense {
  id: string;
  description: string;
  amountCents: number;
}

export interface QuotePayment {
  id: string;
  amountCents: number;
  method: PaymentMethod;
  date: string;
  reference: string;
}

// Only private inputs are persisted. Customer information and totals come from the quote.
export interface InternalCostRecord {
  id: string;
  quoteId: string;
  itemCosts: InternalItemCost[];
  additionalExpenses: AdditionalExpense[];
  payments: QuotePayment[];
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InternalCostsRepository {
  list(): Promise<InternalCostRecord[]>;
  save(record: InternalCostRecord): Promise<InternalCostRecord>;
  addPayment(quoteId: string, payment: QuotePayment, totalCents: number): Promise<InternalCostRecord>;
}
