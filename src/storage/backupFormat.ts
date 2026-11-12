/** Textos y formatos de la pantalla Respaldo. Funciones puras: sin almacenamiento ni Tauri. */
import { formatDate } from '../utils/dateFormat';

const DAY_MS = 24 * 60 * 60 * 1000;
const decimal = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 512 → "512 bytes", 2 516 582 → "2.4 MB". */
export function formatBytes(bytes: number): string {
  const value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (value < 1024) return `${Math.round(value)} ${Math.round(value) === 1 ? 'byte' : 'bytes'}`;
  if (value < 1024 * 1024) return `${decimal.format(value / 1024)} KB`;
  if (value < 1024 * 1024 * 1024) return `${decimal.format(value / (1024 * 1024))} MB`;
  return `${decimal.format(value / (1024 * 1024 * 1024))} GB`;
}

/** 0 → "hoy", 1 → "ayer", 3 → "hace 3 días". */
export function daysAgoText(days: number): string {
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

/** Días enteros entre dos instantes; null si la fecha no es válida. */
export function wholeDaysBetween(iso: string, now = Date.now()): number | null {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : Math.max(0, Math.floor((now - time) / DAY_MS));
}

/** "12 de noviembre de 2026 (hace 3 días)" o el aviso de que nunca se exportó. */
export function formatLastBackup(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Todavía no has exportado un respaldo';
  const days = wholeDaysBetween(iso, now);
  const date = formatDate(iso, 'long');
  if (days === null || !date) return 'Todavía no has exportado un respaldo';
  return `${date} (${daysAgoText(days)})`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "132 cotizaciones, 48 clientes, 15 facturas". */
export function formatRestoredCounts(counts: { quotations: number; customers: number; invoices: number }): string {
  return [
    plural(counts.quotations, 'cotización', 'cotizaciones'),
    plural(counts.customers, 'cliente', 'clientes'),
    plural(counts.invoices, 'factura', 'facturas'),
  ].join(', ');
}

/** Texto del aviso tras restaurar: "Respaldo restaurado: 132 cotizaciones, 48 clientes, 15 facturas". */
export function restoredMessage(counts: { quotations: number; customers: number; invoices: number }): string {
  return `Respaldo restaurado: ${formatRestoredCounts(counts)}`;
}

/** "JC-0042" para el último folio de cotizaciones; "—" si todavía no hay ninguno. */
export function formatQuotationFolio(last: number): string {
  return last > 0 ? `JC-${String(last).padStart(4, '0')}` : '—';
}

/** Folio de facturas con cuatro dígitos; "—" si todavía no hay ninguno. */
export function formatInvoiceFolio(last: number): string {
  return last > 0 ? String(last).padStart(4, '0') : '—';
}
