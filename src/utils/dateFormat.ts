/**
 * Single date module. Date-only strings (YYYY-MM-DD) are parsed by hand as LOCAL dates:
 * `new Date("2026-11-18")` is UTC midnight and shows as the 17th in Mexico.
 */
export type DateVariant = 'short' | 'medium' | 'compact' | 'long' | 'dateTime' | 'monthYear' | 'iso' | 'sharedShort';

const LOCALE = 'es-MX';
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const FORMATS: Record<Exclude<DateVariant, 'iso' | 'short' | 'sharedShort'>, Intl.DateTimeFormat> = {
  medium: new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' }),
  compact: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }),
  long: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }),
  dateTime: new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeStyle: 'short' }),
  monthYear: new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }),
};

const SHARED_DAY_MONTH = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const SHARED_YEAR = new Intl.DateTimeFormat(LOCALE, { year: 'numeric' });
const TIME_12H = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', hour12: true });

const pad = (value: number, size = 2) => String(value).padStart(size, '0');

/** Parses a date-only string as a local date; anything else goes through the Date parser. Returns null if invalid. */
export function parseDate(value: string | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const match = DATE_ONLY.exec(value);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(year, month - 1, day);
    date.setFullYear(year); // years 0-99 would otherwise map to 1900+
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoDate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Adds calendar days in local time (DST safe), keeping the local midnight of the resulting day. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** "6:48 p.m." — 12h clock with a compact, space-free day period. */
export function formatTime12(value: string | Date): string {
  const date = parseDate(value);
  if (!date) return '';
  const parts = TIME_12H.formatToParts(date);
  const time = parts.filter((part) => part.type === 'hour' || part.type === 'minute' || part.type === 'literal').map((part) => part.value.trim() === '' ? '' : part.value).join('');
  const period = (parts.find((part) => part.type === 'dayPeriod')?.value ?? '').replace(/\s/g, '').toLowerCase();
  return `${time} ${period}`.trim();
}

/** "12 nov, 6:48 p.m." — the year is added only when it is not the current one ("12 nov 2025, 6:48 p.m."). */
function formatSharedShort(date: Date, now: Date): string {
  const dayMonth = SHARED_DAY_MONTH.format(date).replace(/\./g, '');
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${SHARED_YEAR.format(date)}`;
  return `${dayMonth}${year}, ${formatTime12(date)}`;
}

/** "18 nov" — day and short month, no year. */
export function formatDayMonth(value: string | Date): string {
  const date = parseDate(value);
  return date ? SHARED_DAY_MONTH.format(date).replace(/\./g, '') : '';
}

/** "18 nov 2026, 11:40 p.m." — always includes the year (used where the record is read long after it happened). */
export function formatDayMonthYearTime(value: string | Date): string {
  const date = parseDate(value);
  return date ? `${formatDayMonth(date)} ${SHARED_YEAR.format(date)}, ${formatTime12(date)}` : '';
}

/** `now` only matters for 'sharedShort' (current-year check); it is a parameter so tests stay deterministic. */
export function formatDate(value: string | Date, variant: DateVariant = 'short', now: Date = new Date()): string {
  const date = parseDate(value);
  if (!date) return '';
  if (variant === 'sharedShort') return formatSharedShort(date, now);
  if (variant === 'iso') return toIsoDate(date);
  if (variant === 'short') return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${pad(date.getFullYear(), 4)}`;
  return FORMATS[variant].format(date);
}

export function monthKey(value: string | Date): string {
  const date = parseDate(value);
  return date ? toIsoDate(date).slice(0, 7) : '';
}
