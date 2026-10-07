import type { InternalControlRecord, Quotation } from '../models/quotation';

export interface InternalControlRepository {
  list(): Promise<InternalControlRecord[]>;
  getByQuotationId(quotationId: string): Promise<InternalControlRecord | undefined>;
  ensureForQuotation(quotation: Quotation): Promise<InternalControlRecord>;
  save(record: InternalControlRecord, quotation: Quotation): Promise<InternalControlRecord>;
}
