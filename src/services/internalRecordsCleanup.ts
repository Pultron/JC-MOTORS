import type { InternalCostsRepository } from '../models/internalCosts';
import type { InternalControlRepository } from '../repositories/InternalControlRepository';
import { internalControlService } from './internalControlService';
import { internalCostsStorageService } from './internalCostsStorageService';

interface Repositories {
  control: Pick<InternalControlRepository, 'deleteByQuotationId'>;
  costs: Pick<InternalCostsRepository, 'deleteByQuoteId'>;
}

const defaults: Repositories = { control: internalControlService, costs: internalCostsStorageService };

/**
 * Removes every private record of a quotation: the legacy control record and the current cost record.
 * The legacy record goes first because reading costs re-migrates legacy part costs when no cost record exists,
 * so deleting only the cost record could bring it back. Both deletes are idempotent; a failure rejects so the
 * caller does not delete the quotation and leave the data half-removed without noticing.
 */
export async function removeInternalRecordsOf(quotationId: string, repositories: Repositories = defaults): Promise<void> {
  await repositories.control.deleteByQuotationId(quotationId);
  await repositories.costs.deleteByQuoteId(quotationId);
}
