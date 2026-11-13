import type { BusinessInfo } from '../config/businessInfo';
import type { Invoice } from '../models/invoice';
import type { PublicQuotation } from '../models/quotation';
import { formatDate } from '../utils/dateFormat';
import { formatearFolio, formatMoney as formatInvoiceMoney } from '../utils/invoiceFormat';
import { formatMoney } from '../utils/money';
import { validUntil } from './quotationLayout';

/** Message sent to customers by WhatsApp / email. Variables are written as {name}. */
export const DEFAULT_MESSAGE_TEMPLATE = 'Hola {nombre}, te comparto la cotización {folio} de {taller} para tu {vehiculo}.\nTotal: {total}\nVigente hasta: {vigencia}\nCualquier duda, estamos a tus órdenes.\n{taller} · {telefono_taller}';

/** Upper bound for a custom template. Keeps the final text well under the native limits (4000 chars of body). */
export const MESSAGE_TEMPLATE_MAX = 800;

export type MessageVariable = 'nombre' | 'folio' | 'taller' | 'vehiculo' | 'total' | 'vigencia' | 'telefono_taller';

export interface MessageVariableInfo {
  key: MessageVariable;
  description: string;
  example: string;
}

/** Variables the template understands, with the sample value used by the live preview. */
export const MESSAGE_VARIABLES: readonly MessageVariableInfo[] = [
  { key: 'nombre', description: 'Primer nombre del cliente', example: 'María' },
  { key: 'folio', description: 'Folio de la cotización', example: 'JC-0005' },
  { key: 'taller', description: 'Nombre del taller', example: 'JC MOTORS' },
  { key: 'vehiculo', description: 'Marca, modelo y año del vehículo', example: 'Nissan Sentra 2022' },
  { key: 'total', description: 'Total de la cotización', example: '$4,350.00' },
  { key: 'vigencia', description: 'Fecha hasta la que es válida', example: '27 de noviembre de 2026' },
  { key: 'telefono_taller', description: 'Teléfono del taller', example: '(667) 351-8806' },
];

export const EXAMPLE_VALUES: Readonly<Record<MessageVariable, string>> = Object.freeze(
  Object.fromEntries(MESSAGE_VARIABLES.map((variable) => [variable.key, variable.example])) as Record<MessageVariable, string>,
);

/**
 * Only the FIRST word counts: "María José Pérez" -> "María". Compound given names are not detectable
 * reliably ("José Luis" vs "Juan Carlos Pérez"), so the greeting stays short and safe.
 */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

export function vehicleLabel(vehicle: { make: string; model: string; year?: number }): string {
  return [vehicle.make, vehicle.model, vehicle.year ? String(vehicle.year) : ''].map((part) => part.trim()).filter(Boolean).join(' ');
}

/** Values for a render. A template may use only some variables (invoices have no vehicle or validity). */
export type MessageValues = Readonly<Partial<Record<MessageVariable, string>>>;

/**
 * Replaces {variables}. Unknown names are left untouched; values are inserted literally (no `$&` surprises).
 * When {vehiculo} is empty the whole " para tu {vehiculo}" phrase is dropped and leftover spacing is cleaned.
 */
export function renderTemplate(template: string, values: MessageValues): string {
  let source = template;
  if (values.vehiculo !== undefined && !values.vehiculo.trim()) source = source.replace(/[ \t]*\bpara tu \{vehiculo\}/g, '');
  const filled = source.replace(/\{([a-z_]+)\}/g, (match, key: string) => {
    const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key as MessageVariable] : undefined;
    return typeof value === 'string' ? value : match;
  });
  return filled
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .trim();
}

export function messageValues(quotation: PublicQuotation, business: Pick<BusinessInfo, 'nombre' | 'telefonos'>): Record<MessageVariable, string> {
  return {
    nombre: firstName(quotation.customer.name),
    folio: quotation.folio,
    taller: business.nombre,
    vehiculo: vehicleLabel(quotation.vehicle),
    total: formatMoney(quotation.total),
    vigencia: formatDate(validUntil(quotation), 'long'),
    telefono_taller: business.telefonos[0] ?? '',
  };
}

export interface ShareMessage {
  /** WhatsApp text and email body (same text). */
  text: string;
  /** Email subject: "Cotización JC-0005 · JC Motors". */
  subject: string;
}

/** Email subject: "Cotización JC-0005 · JC Motors". */
export function buildShareSubject(folio: string, businessName: string): string {
  return `Cotización ${folio} · ${businessName}`;
}

export function buildShareMessage(quotation: PublicQuotation, business: Pick<BusinessInfo, 'nombre' | 'telefonos' | 'mensajeClientes'>): ShareMessage {
  const template = business.mensajeClientes?.trim() ? business.mensajeClientes : DEFAULT_MESSAGE_TEMPLATE;
  return {
    text: renderTemplate(template, messageValues(quotation, business)),
    subject: buildShareSubject(quotation.folio, business.nombre),
  };
}

/** Live preview with the sample data of MESSAGE_VARIABLES. */
export function previewMessage(template: string): string {
  return renderTemplate(template, EXAMPLE_VALUES);
}

// ---- Invoices --------------------------------------------------------------------------------------------------

/** Default message for sharing an invoice (editable in "Datos del taller"). */
export const DEFAULT_INVOICE_MESSAGE_TEMPLATE = 'Hola {nombre}, te comparto tu factura {folio} de {taller}.\nTotal: {total}\nCualquier duda, estamos a tus órdenes.\n{taller} · {telefono_taller}';

/** Variables an invoice message understands. Any other {name} stays as typed. */
export const INVOICE_MESSAGE_VARIABLES: readonly MessageVariableInfo[] = [
  { key: 'nombre', description: 'Primer nombre del cliente', example: 'María' },
  { key: 'folio', description: 'Folio interno de la factura', example: '0042' },
  { key: 'taller', description: 'Nombre del taller', example: 'JC MOTORS' },
  { key: 'total', description: 'Total de la factura', example: '$4,350.00' },
  { key: 'telefono_taller', description: 'Teléfono del taller', example: '(667) 351-8806' },
];

export const INVOICE_EXAMPLE_VALUES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(INVOICE_MESSAGE_VARIABLES.map((variable) => [variable.key, variable.example])),
);

/** "JUAN PÉREZ" -> "Juan": CFDI names are usually all caps, which reads as shouting in a greeting. */
function greetingName(fullName: string): string {
  const first = firstName(fullName);
  return first && first === first.toLocaleUpperCase('es-MX') && first !== first.toLocaleLowerCase('es-MX')
    ? first.charAt(0) + first.slice(1).toLocaleLowerCase('es-MX')
    : first;
}

/** Total as the SAT wrote it ("$4,350.00"), with the currency code when it is not pesos. */
function invoiceTotalText(invoice: Pick<Invoice, 'total' | 'moneda'>): string {
  const amount = formatInvoiceMoney(invoice.total) || invoice.total.trim();
  const currency = invoice.moneda?.trim().toUpperCase();
  return amount && currency && currency !== 'MXN' ? `${amount} ${currency}` : amount;
}

export function invoiceMessageValues(
  invoice: Pick<Invoice, 'folio' | 'total' | 'moneda' | 'receptor'>,
  business: Pick<BusinessInfo, 'nombre' | 'telefonos'>,
  contactName?: string,
): Record<'nombre' | 'folio' | 'taller' | 'total' | 'telefono_taller', string> {
  return {
    nombre: greetingName(contactName?.trim() || invoice.receptor.nombre),
    folio: formatearFolio(invoice.folio),
    taller: business.nombre,
    total: invoiceTotalText(invoice),
    telefono_taller: business.telefonos[0] ?? '',
  };
}

/** Email subject: "Factura 0042 · JC Motors". */
export function buildInvoiceShareSubject(folio: number, businessName: string): string {
  return `Factura ${formatearFolio(folio)} · ${businessName}`;
}

/** Text (WhatsApp / email body) and subject for an invoice. `contactName` (the matched Cliente) wins over the receptor's legal name for the greeting. */
export function buildInvoiceShareMessage(
  invoice: Pick<Invoice, 'folio' | 'total' | 'moneda' | 'receptor'>,
  business: Pick<BusinessInfo, 'nombre' | 'telefonos' | 'mensajeFacturas'>,
  contactName?: string,
): ShareMessage {
  const template = business.mensajeFacturas?.trim() ? business.mensajeFacturas : DEFAULT_INVOICE_MESSAGE_TEMPLATE;
  return {
    text: renderTemplate(template, invoiceMessageValues(invoice, business, contactName)),
    subject: buildInvoiceShareSubject(invoice.folio, business.nombre),
  };
}

/** Live preview of an invoice template with sample data. */
export function previewInvoiceMessage(template: string): string {
  return renderTemplate(template, INVOICE_EXAMPLE_VALUES);
}
