import type { InternalCostsRepository } from '../models/internalCosts';
import { createInternalCostsRepository } from '../repositories/repositoryFactory';

export const internalCostsStorageService: InternalCostsRepository = createInternalCostsRepository();
