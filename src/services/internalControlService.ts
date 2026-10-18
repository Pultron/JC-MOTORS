import { LocalStorageInternalControlRepository } from '../repositories/LocalStorageInternalControlRepository';
import type { InternalControlRepository } from '../repositories/InternalControlRepository';

export const internalControlService: InternalControlRepository = new LocalStorageInternalControlRepository();
