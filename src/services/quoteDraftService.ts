import type { QuoteDraft, QuoteFormData } from '../models/quoteDraft';
import { createId } from '../utils/quotation';
import { quotationService } from './quotationService';
import { nextFolio, SAVED_DRAFTS_KEY } from './folioService';

const TEMP_KEY = 'jc-motors:quote-autosave:v1';

export interface TemporaryQuoteDraft {
  data: QuoteFormData;
  draftId: string | null;
}

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export const quoteDraftService = {
  list(): QuoteDraft[] {
    const drafts = read<QuoteDraft[]>(SAVED_DRAFTS_KEY, []);
    return Array.isArray(drafts) ? drafts.filter((draft) => draft && typeof draft.id === 'string' && typeof draft.folio === 'string' && draft.data && Array.isArray(draft.data.items)) : [];
  },
  getTemporary(): TemporaryQuoteDraft | null {
    const value = read<TemporaryQuoteDraft | null>(TEMP_KEY, null);
    return value && typeof value === 'object' && value.data && Array.isArray(value.data.items) ? value : null;
  },
  saveTemporary(data: QuoteFormData, draftId: string | null): void {
    write(TEMP_KEY, { data, draftId });
  },
  deleteTemporary(): void {
    localStorage.removeItem(TEMP_KEY);
  },
  async save(data: QuoteFormData, existing?: QuoteDraft): Promise<QuoteDraft> {
    const drafts = this.list();
    const folio = existing?.folio ?? await this.nextFolio();
    const draft: QuoteDraft = {
      id: existing?.id ?? createId(), folio,
      status: 'Borrador',
      savedAt: new Date().toISOString(), data,
    };
    write(SAVED_DRAFTS_KEY, [draft, ...drafts.filter((item) => item.id !== draft.id)]);
    return draft;
  },
  delete(id: string): void {
    write(SAVED_DRAFTS_KEY, this.list().filter((draft) => draft.id !== id));
  },
  async nextFolio(): Promise<string> {
    const quotes = await quotationService.list();
    return nextFolio([...quotes.map((quote) => quote.folio), ...this.list().map((draft) => draft.folio)]);
  },
};
