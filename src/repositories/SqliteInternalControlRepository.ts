import type { InternalControlRecord, Quotation } from '../models/quotation';
import { LocalStorageInternalControlRepository } from './LocalStorageInternalControlRepository';
import { confirmed } from './sqliteConfirm';

export class SqliteInternalControlRepository extends LocalStorageInternalControlRepository {
  override ensureForQuotation(quotation: Quotation): Promise<InternalControlRecord> { return confirmed(super.ensureForQuotation(quotation)); }
  override deleteByQuotationId(quotationId: string): Promise<void> { return confirmed(super.deleteByQuotationId(quotationId)); }
  override save(record: InternalControlRecord, quotation: Quotation): Promise<InternalControlRecord> { return confirmed(super.save(record, quotation)); }
}
