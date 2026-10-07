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

// Only private inputs are persisted. Customer information and totals come from the quote.
export interface InternalCostRecord {
  id: string;
  quoteId: string;
  itemCosts: InternalItemCost[];
  additionalExpenses: AdditionalExpense[];
  createdAt: string;
  updatedAt: string;
}

export interface InternalCostsRepository {
  list(): Promise<InternalCostRecord[]>;
  save(record: InternalCostRecord): Promise<InternalCostRecord>;
}
