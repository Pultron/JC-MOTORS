import type { InternalCostsRepository } from '../models/internalCosts';
import { isSqliteActive } from '../storage/sqliteStorage';
import type { InternalControlRepository } from './InternalControlRepository';
import type { InvoiceRepository } from './InvoiceRepository';
import { LocalStorageInternalControlRepository } from './LocalStorageInternalControlRepository';
import { LocalStorageInternalCostsRepository } from './LocalStorageInternalCostsRepository';
import { LocalStorageInvoiceRepository } from './LocalStorageInvoiceRepository';
import { LocalStorageQuotationRepository } from './LocalStorageQuotationRepository';
import type { QuotationRepository } from './QuotationRepository';
import { SqliteInternalControlRepository } from './SqliteInternalControlRepository';
import { SqliteInternalCostsRepository } from './SqliteInternalCostsRepository';
import { SqliteInvoiceRepository } from './SqliteInvoiceRepository';
import { SqliteQuotationRepository } from './SqliteQuotationRepository';

/**
 * ÚNICO lugar que decide entre SQLite y localStorage. Las pantallas y los servicios solo piden «un repositorio».
 * SQLite está activo cuando el arranque instaló el almacén enrutado (solo dentro de Tauri y con la base lista).
 */
export const createQuotationRepository = (): QuotationRepository => (isSqliteActive() ? new SqliteQuotationRepository() : new LocalStorageQuotationRepository());
export const createInvoiceRepository = (): InvoiceRepository => (isSqliteActive() ? new SqliteInvoiceRepository() : new LocalStorageInvoiceRepository());
export const createInternalControlRepository = (): InternalControlRepository => (isSqliteActive() ? new SqliteInternalControlRepository() : new LocalStorageInternalControlRepository());
export const createInternalCostsRepository = (): InternalCostsRepository => (isSqliteActive() ? new SqliteInternalCostsRepository() : new LocalStorageInternalCostsRepository());
