import type { InternalCostRecord } from '../models/internalCosts';
import { LocalStorageInternalCostsRepository } from './LocalStorageInternalCostsRepository';
import { confirmed } from './sqliteConfirm';

export class SqliteInternalCostsRepository extends LocalStorageInternalCostsRepository {
  override save(record: InternalCostRecord): Promise<InternalCostRecord> { return confirmed(super.save(record)); }
}
