import { LocalStorageQuotationRepository } from '../repositories/LocalStorageQuotationRepository';
import type { QuotationRepository } from '../repositories/QuotationRepository';

export const quotationService: QuotationRepository = new LocalStorageQuotationRepository();
