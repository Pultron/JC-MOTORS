import type { InternalCostsRepository } from '../models/internalCosts';
import { LocalStorageInternalCostsRepository } from '../repositories/LocalStorageInternalCostsRepository';

// Replace this adapter with SQLite without changing the visual components.
export const internalCostsStorageService: InternalCostsRepository = new LocalStorageInternalCostsRepository();
