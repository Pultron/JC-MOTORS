import { createQuotationRepository } from '../repositories/repositoryFactory';
import type { QuotationRepository } from '../repositories/QuotationRepository';

export const quotationService: QuotationRepository = createQuotationRepository();
