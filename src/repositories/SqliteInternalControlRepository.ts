import type { InternalControlRecord, Quotation } from '../models/quotation';
import { LocalStorageInternalControlRepository } from './LocalStorageInternalControlRepository';
import { confirmed } from './sqliteConfirm';

export class SqliteInternalControlRepository extends LocalStorageInternalControlRepository {
  override ensureForQuotation(quotation: Quotation): Promise<InternalControlRecord> { return confirmed(super.ensureForQuotation(quotation)); }
  override save(record: InternalControlRecord, quotation: Quotation): Promise<InternalControlRecord> { return confirmed(super.save(record, quotation)); }
}
