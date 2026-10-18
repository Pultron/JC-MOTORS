export type QuotationStatus = 'Pendiente' | 'Aprobada' | 'Cancelada';

/** Transiciones de estado permitidas. Aprobar bloquea la cotización: ya no admite cambios posteriores. */
export const TERMINAL_STATUSES: readonly QuotationStatus[] = ['Aprobada', 'Cancelada'];
export type QuotationItemType = 'labor' | 'part';
export type DiscountType = 'percentage' | 'fixed';
export type InternalStatus = 'pending_capture' | 'complete';
export type PaymentStatus = 'pending' | 'partial' | 'paid';
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other';

export interface Customer {
  name: string;
  phone: string;
  email?: string;
}

export interface CustomerProfile extends Customer {
  id: string;
  aliases: string[];
}

export type CustomerProfileInput = Omit<CustomerProfile, 'id'>;

export interface Vehicle {
  make: string;
  model: string;
  year?: number;
  plates: string;
}

export interface QuotationItem {
  id: string;
  type: QuotationItemType;
  description: string;
  quantity: number;
  saleUnitPrice: number;
  amount: number;
}

export interface Quotation {
  id: string;
  folio: string;
  createdAt: string;
  customerId?: string;
  customer: Customer;
  vehicle: Vehicle;
  items: QuotationItem[];
  laborDiscountType: DiscountType;
  laborDiscountValue: number;
  includeVat: boolean;
  subtotalNeto?: number;
  ivaAmount?: number;
  total?: number;
  validityDays: number;
  publicNotes: string;
  customerNotes?: string;
  status: QuotationStatus;
  approvedAt?: string;
}

export interface CreateQuotationInput {
  preferredFolio?: string;
  customerId?: string;
  customer: Customer;
  vehicle: Vehicle;
  items: Omit<QuotationItem, 'amount'>[];
  laborDiscountType: DiscountType;
  laborDiscountValue: number;
  includeVat: boolean;
  validityDays: number;
  publicNotes: string;
  customerNotes?: string;
}

export interface InternalPartCost {
  quotationItemId: string;
  supplierUnitCost: number;
  supplierDiscountType: DiscountType;
  supplierDiscountValue: number;
}

export interface InternalControlRecord {
  id: string;
  quotationId: string;
  partCosts: InternalPartCost[];
  internalStatus: InternalStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | '';
  amountReceived: number;
  paymentDate: string;
  paymentReference: string;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
}

/** A strict allowlist of data that may appear in the customer's printable quotation. */
export interface PublicQuotation {
  businessName: string;
  folio: string;
  createdAt: string;
  customer: Customer;
  vehicle: Vehicle;
  items: Array<Pick<QuotationItem, 'id' | 'type' | 'description' | 'quantity' | 'saleUnitPrice' | 'amount'>>;
  laborDiscount: number;
  subtotalRefacciones: number;
  subtotalManoObra: number;
  subtotalNeto: number;
  includeVat: boolean;
  ivaAmount: number;
  total: number;
  validityDays: number;
  publicNotes: string;
  customerNotes?: string;
}
