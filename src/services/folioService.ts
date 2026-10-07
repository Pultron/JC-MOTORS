export const SAVED_DRAFTS_KEY = 'jc-motors:quote-drafts:v1';

export function nextFolio(folios: string[]): string {
  const highest = folios.reduce((value, folio) => Math.max(value, Number(/^JC-(\d+)$/.exec(folio)?.[1] ?? 0)), 0);
  return `JC-${String(highest + 1).padStart(4, '0')}`;
}

export function reservedDraftFolios(): string[] {
  try {
    const saved = localStorage.getItem(SAVED_DRAFTS_KEY);
    const drafts: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(drafts) ? drafts.map((draft) => draft?.folio).filter((folio): folio is string => typeof folio === 'string') : [];
  } catch {
    return [];
  }
}
