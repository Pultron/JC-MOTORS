import type { QuoteDraft, QuoteFormData } from '../models/quoteDraft';
import { createId } from '../utils/quotation';
import { quotationService } from './quotationService';
import { nextFolio, SAVED_DRAFTS_KEY } from './folioService';
import { readGuardedJson } from '../storage/corruptBackup';
import type { GuardedReadOptions } from '../storage/corruptBackup';
import { removeRaw, writeRaw } from '../storage/safeStorage';

const TEMP_KEY = 'jc-motors:quote-autosave:v1';

export interface TemporaryQuoteDraft {
  data: QuoteFormData;
  draftId: string | null;
}

const DRAFTS_DAMAGED: GuardedReadOptions = {
  backupName: 'quote-drafts',
  damagedMessage: 'Los borradores estaban dañados; se guardó una copia de respaldo',
};
const TEMP_DAMAGED: GuardedReadOptions = {
  backupName: 'quote-autosave',
  damagedMessage: 'El borrador automático estaba dañado; se guardó una copia de respaldo',
};

function read<T>(key: string, fallback: T, damaged: GuardedReadOptions): T {
  const result = readGuardedJson(key, damaged, (value): value is T => value !== undefined);
  return result.status === 'ok' ? result.value : fallback;
}

function write(key: string, value: unknown): void {
  writeRaw(key, JSON.stringify(value));
}

export const quoteDraftService = {
  list(): QuoteDraft[] {
    const drafts = read<QuoteDraft[]>(SAVED_DRAFTS_KEY, [], DRAFTS_DAMAGED);
    return Array.isArray(drafts) ? drafts.filter((draft) => draft && typeof draft.id === 'string' && typeof draft.folio === 'string' && draft.data && Array.isArray(draft.data.items)) : [];
  },
  getTemporary(): TemporaryQuoteDraft | null {
    const value = read<TemporaryQuoteDraft | null>(TEMP_KEY, null, TEMP_DAMAGED);
    return value && typeof value === 'object' && value.data && Array.isArray(value.data.items) ? value : null;
  },
  saveTemporary(data: QuoteFormData, draftId: string | null): void {
    write(TEMP_KEY, { data, draftId });
  },
  deleteTemporary(): void {
    removeRaw(TEMP_KEY);
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
