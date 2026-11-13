import { createInternalControlRepository } from '../repositories/repositoryFactory';
import type { InternalControlRepository } from '../repositories/InternalControlRepository';

export const internalControlService: InternalControlRepository = createInternalControlRepository();
