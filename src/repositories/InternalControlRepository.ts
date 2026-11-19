import type { InternalControlRecord, Quotation } from '../models/quotation';

export interface InternalControlRepository {
  list(): Promise<InternalControlRecord[]>;
  getByQuotationId(quotationId: string): Promise<InternalControlRecord | undefined>;
  ensureForQuotation(quotation: Quotation): Promise<InternalControlRecord>;
  /** Removes the legacy control record of a quotation. Idempotent: resolves even when there is none. */
  deleteByQuotationId(quotationId: string): Promise<void>;
  save(record: InternalControlRecord, quotation: Quotation): Promise<InternalControlRecord>;
}
