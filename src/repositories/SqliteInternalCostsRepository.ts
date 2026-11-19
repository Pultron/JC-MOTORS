import type { InternalCostRecord } from '../models/internalCosts';
import { LocalStorageInternalCostsRepository } from './LocalStorageInternalCostsRepository';
import { confirmed } from './sqliteConfirm';

export class SqliteInternalCostsRepository extends LocalStorageInternalCostsRepository {
  override deleteByQuoteId(quoteId: string): Promise<void> { return confirmed(super.deleteByQuoteId(quoteId)); }
  override save(record: InternalCostRecord): Promise<InternalCostRecord> { return confirmed(super.save(record)); }
}
