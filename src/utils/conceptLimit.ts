import { MAX_CONCEPTS } from '../services/quotationLayout';

export const CONCEPT_WARNING_FROM = 90;
export const CONCEPT_LIMIT_MESSAGE = `Límite de ${MAX_CONCEPTS} conceptos alcanzado`;

export type ConceptCounterLevel = 'ok' | 'warning' | 'full';

/** Neutral below 90, amber from 90, red when the limit is reached. */
export function conceptCounterLevel(count: number): ConceptCounterLevel {
  if (count >= MAX_CONCEPTS) return 'full';
  return count >= CONCEPT_WARNING_FROM ? 'warning' : 'ok';
}
