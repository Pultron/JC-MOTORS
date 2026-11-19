export type ShareMedium = 'whatsapp' | 'email';

export type QuotationStatus = 'Pendiente' | 'Aprobada' | 'Cancelada' | 'Vencida';

/** Statuses a quotation can be cancelled from. */
export type CancellableStatus = 'Pendiente' | 'Aprobada';

/** Longest cancellation reason (after trimming) that is accepted and stored. */
export const MAX_CANCELLATION_REASON = 120;

/** Estados terminales: una cotización aprobada, cancelada o vencida ya no admite cambios. */
/** Statuses whose quotations may be deleted permanently (closed without becoming a job). */
export const DELETABLE_STATUSES: readonly QuotationStatus[] = ['Cancelada', 'Vencida'];
export const isDeletableStatus = (status: QuotationStatus): boolean => DELETABLE_STATUSES.includes(status);

export const TERMINAL_STATUSES: readonly QuotationStatus[] = ['Aprobada', 'Cancelada', 'Vencida'];
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
  /** Labor lines only: id of the service item this labor belongs to. Absent on parts and on legacy loose labor. */
  parentId?: string;
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
  /** ISO time at which the app launched WhatsApp/email for this quotation (record only; never part of PublicQuotation). */
  sharedAt?: string;
  sharedVia?: ShareMedium;
  /** Why the quotation was cancelled. Required when an approved quotation is cancelled; may be absent on older records. */
  cancellationReason?: string;
  /** ISO time of the cancellation. Absent on quotations cancelled before this field existed. */
  cancelledAt?: string;
  /** Status the quotation had when it was cancelled. */
  statusBeforeCancel?: CancellableStatus;
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
  items: Array<Pick<QuotationItem, 'id' | 'type' | 'description' | 'quantity' | 'saleUnitPrice' | 'amount' | 'parentId'>>;
  laborDiscount: number;
  /** Percentage that produced `laborDiscount`; absent when the discount is a fixed amount. */
  laborDiscountPercent?: number;
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
