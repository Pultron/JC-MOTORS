import type { QuoteDraft, QuoteFormData } from '../models/quoteDraft';
import { createId } from '../utils/quotation';
import { quotationService } from './quotationService';
import { nextFolio, SAVED_DRAFTS_KEY } from './folioService';
import { readGuardedJson } from '../storage/corruptBackup';
import type { GuardedReadOptions } from '../storage/corruptBackup';
import { isQuotaError, removeRaw, writeRaw } from '../storage/safeStorage';
import { emitStorageNotice } from '../storage/storageNotices';
import { STORAGE_KEYS } from '../storage/storageKeys';

const TEMP_KEY = STORAGE_KEYS.quoteAutosave;
const STALE_DRAFT_DAYS = 30;

export class DraftStorageFullError extends Error {
  constructor() {
    super('No se pudo guardar el borrador: almacenamiento lleno');
    this.name = 'DraftStorageFullError';
  }
}

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
  /** Lanza DraftStorageFullError si no hay espacio; lo ya guardado queda intacto. */
  saveTemporary(data: QuoteFormData, draftId: string | null): void {
    try {
      write(TEMP_KEY, { data, draftId });
    } catch (error) {
      if (isQuotaError(error)) throw new DraftStorageFullError();
      throw error;
    }
  },
  /** Borra los borradores guardados que llevan más de 30 días sin modificarse. Devuelve cuántos quitó. */
  purgeStale(now = Date.now(), maxAgeDays = STALE_DRAFT_DAYS): number {
    const result = readGuardedJson(SAVED_DRAFTS_KEY, DRAFTS_DAMAGED, (value): value is unknown[] => Array.isArray(value));
    if (result.status !== 'ok') return 0;
    const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
    // Solo se descarta por antigüedad comprobable; lo ilegible o sin fecha se conserva tal cual.
    const kept = result.value.filter((draft) => {
      const savedAt = Date.parse((draft as { savedAt?: string } | null)?.savedAt ?? '');
      return !Number.isFinite(savedAt) || savedAt >= cutoff;
    });
    const removed = result.value.length - kept.length;
    if (removed === 0) return 0;
    write(SAVED_DRAFTS_KEY, kept);
    emitStorageNotice({
      level: 'info',
      title: 'Borradores antiguos eliminados',
      description: removed === 1
        ? 'Se eliminó 1 borrador con más de 30 días sin modificar.'
        : `Se eliminaron ${removed} borradores con más de 30 días sin modificar.`,
    });
    return removed;
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
