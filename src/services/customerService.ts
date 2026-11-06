import type { CustomerProfile } from '../models/quotation';
import { readGuardedJson } from '../storage/corruptBackup';
import type { GuardedReadOptions } from '../storage/corruptBackup';
import { writeRaw } from '../storage/safeStorage';

const STORAGE_KEY = 'jc-motors:customers:v1';
const DAMAGED: GuardedReadOptions = {
  backupName: 'customers',
  damagedMessage: 'Los clientes estaban dañados; se guardó una copia de respaldo',
};

export const customerService = {
  list(): CustomerProfile[] {
    const result = readGuardedJson(STORAGE_KEY, DAMAGED, (value): value is unknown[] => Array.isArray(value));
    if (result.status !== 'ok') return [];
    return result.value.filter((customer) => customer && typeof (customer as CustomerProfile).id === 'string'
      && typeof (customer as CustomerProfile).name === 'string' && Array.isArray((customer as CustomerProfile).aliases)) as CustomerProfile[];
  },
  save(customers: CustomerProfile[]): void {
    writeRaw(STORAGE_KEY, JSON.stringify(customers));
  },
};
