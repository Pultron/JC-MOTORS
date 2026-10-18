import type { Quotation } from '../models/quotation';

export type Period = 'today' | 'week' | 'month' | 'custom';
export interface DateRange { start: string; end: string }

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function periodRange(period: Exclude<Period, 'custom'>, now = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  if (period === 'week') {
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
  } else if (period === 'month') {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  }
  return { start: localDate(start), end: localDate(end) };
}

export function isInRange(quote: Quotation, range: DateRange): boolean {
  const date = localDate(new Date(quote.approvedAt ?? quote.createdAt));
  return quote.status === 'Aprobada' && Boolean(range.start && range.end) && date >= range.start && date <= range.end;
}

export function rangeLabel(range: DateRange): string {
  const fmt = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  return range.start && range.end ? `${fmt(range.start)} – ${fmt(range.end)}` : 'Seleccionar fechas';
}
