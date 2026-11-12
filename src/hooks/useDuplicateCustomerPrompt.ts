import { useCallback } from 'react';
import { useChoice } from '../components/ui/ChoiceDialog';
import type { CustomerProfile } from '../models/quotation';
import type { DuplicateChoice } from '../services/customerMatching';

/** Returns the question shown when a customer with the same name but another phone already exists. */
export function useDuplicateCustomerPrompt(): (existing: CustomerProfile) => Promise<DuplicateChoice> {
  const choose = useChoice();
  return useCallback((existing) => choose<DuplicateChoice>({
    title: `Ya existe «${existing.name}» con otro teléfono`,
    description: '¿Es el mismo cliente?',
    dismissValue: 'cancel',
    choices: [
      { value: 'same', label: 'Es el mismo (actualizar teléfono)', tone: 'primary' },
      { value: 'other', label: 'Es otra persona' },
      { value: 'cancel', label: 'Cancelar' },
    ],
  }), [choose]);
}
