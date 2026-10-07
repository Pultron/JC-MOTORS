import type { DiscountType, QuotationItemType } from './quotation';

export interface QuoteDraftItem {
  id: string;
  type: QuotationItemType;
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface QuoteFormData {
  customerId: string;
  customerName: string;
  phone: string;
  email: string;
  make: string;
  model: string;
  year: string;
  plates: string;
  items: QuoteDraftItem[];
  laborAmount: string;
  laborDiscountType: DiscountType;
  laborDiscountValue: string;
  ivaEnabled: boolean;
  validityDays: string;
  publicNotes: string;
  customerNotes: string;
}

export interface QuoteDraft {
  id: string;
  folio: string;
  status: 'Borrador';
  savedAt: string;
  data: QuoteFormData;
}
