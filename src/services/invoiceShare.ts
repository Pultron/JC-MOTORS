import type { Invoice } from '../models/invoice';
import type { CustomerProfile } from '../models/quotation';
import { base64ToBytes } from '../utils/base64';
import { formatearFolio } from '../utils/invoiceFormat';
import { customersNamed } from './customerMatching';
import { hasEmailMedium, hasWhatsAppMedium, sanitizeFileBase } from './shareQuotation';
import type { ShareContact } from './shareQuotation';

/** "Factura 0042 - Nombre del receptor" (sanitized, no extension). */
export function invoiceFilenameBase(invoice: Pick<Invoice, 'folio' | 'receptor'>): string {
  const name = invoice.receptor.nombre.trim();
  const folio = formatearFolio(invoice.folio);
  return sanitizeFileBase(name ? `Factura ${folio} - ${name}` : `Factura ${folio}`);
}

export interface InvoiceContact {
  contact: ShareContact;
  /** The saved Cliente this invoice's receptor matched by name (first match), if any. */
  customer?: CustomerProfile;
}

/**
 * Invoices carry no phone or email, so they come from the Cliente whose name (or alias) equals the receptor's name.
 * When several share the name, each medium is taken from the first one that has it in usable form.
 */
export function resolveInvoiceContact(invoice: Pick<Invoice, 'receptor'>, customers: readonly CustomerProfile[]): InvoiceContact {
  const named = customersNamed([...customers], invoice.receptor.nombre);
  const withPhone = named.find((customer) => hasWhatsAppMedium({ phone: customer.phone, email: '' }));
  const withEmail = named.find((customer) => hasEmailMedium({ phone: '', email: customer.email ?? '' }));
  return {
    contact: { phone: withPhone?.phone ?? '', email: withEmail?.email ?? '' },
    ...(named[0] ? { customer: named[0] } : {}),
  };
}

export type InvoiceAttachment = { bytes: Uint8Array; ext: 'pdf' | 'xml' };

/** The original file the invoice was imported from (PDF or XML), decoded. Throws when the stored copy is empty or unreadable. */
export function invoiceAttachment(invoice: Pick<Invoice, 'archivoOriginal' | 'archivoTipo'>): InvoiceAttachment {
  if (!invoice.archivoOriginal) throw new Error('La factura no conserva el archivo original.');
  return { bytes: base64ToBytes(invoice.archivoOriginal), ext: invoice.archivoTipo === 'pdf' ? 'pdf' : 'xml' };
}
