import type { QuotationItemType } from '../models/quotation';

export interface FrequentConcept {
  description: string;
  type: QuotationItemType;
}

export const frequentConcepts: FrequentConcept[] = [
  { description: 'Cambio de aceite', type: 'labor' },
  { description: 'Afinación', type: 'labor' },
  { description: 'Revisión de frenos', type: 'labor' },
  { description: 'Cambio de balatas', type: 'labor' },
  { description: 'Diagnóstico general', type: 'labor' },
  { description: 'Mano de obra general', type: 'labor' },
  { description: 'Filtro de aceite', type: 'part' },
];
