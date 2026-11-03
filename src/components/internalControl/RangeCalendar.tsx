import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { localDate } from '../../utils/dateRangeUtils';
import type { DateRange } from '../../utils/dateRangeUtils';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const parse = (iso: string) => new Date(`${iso}T12:00:00`);
const fmt = (iso: string) => parse(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

interface Props { value: DateRange; onApply: (range: DateRange) => void; onCancel: () => void }

/** Calendario de rango estilo macOS: dos clics eligen inicio y fin; reemplaza al selector nativo de fecha. */
export function RangeCalendar({ value, onApply, onCancel }: Props) {
  const initial = value.start ? parse(value.start) : new Date();
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [draft, setDraft] = useState<DateRange>(value);
  const [hover, setHover] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const today = localDate(new Date());

  // Clic fuera cierra; el clic en el botón disparador (mismo contenedor) lo maneja él mismo.
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.parentElement?.contains(event.target as Node)) onCancel();
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onCancel]);
  // Con inicio ya elegido y sin fin, el siguiente clic cierra el rango.
  const picking = Boolean(draft.start) && !draft.end;

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i);
      return { iso: localDate(date), day: date.getDate(), outside: date.getMonth() !== first.getMonth() };
    });
  }, [month]);

  function pick(iso: string) {
    if (!picking) { setDraft({ start: iso, end: '' }); return; }
    setDraft(iso < draft.start ? { start: iso, end: draft.start } : { start: draft.start, end: iso });
  }

  const preview = picking && hover ? (hover < draft.start ? { start: hover, end: draft.start } : { start: draft.start, end: hover }) : draft;
  const shift = (delta: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  const title = month.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  return <div ref={root} className="profit-range-popover" role="dialog" aria-label="Seleccionar rango de fechas" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
    <div className="profit-cal-head">
      <strong>{title}</strong>
      <div>
        <button type="button" className="profit-cal-nav profit-cal-prev" aria-label="Mes anterior" onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
        <button type="button" className="profit-cal-nav profit-cal-next" aria-label="Mes siguiente" onClick={() => shift(1)}><ChevronRight size={16} /></button>
      </div>
    </div>
    <div className="profit-cal-grid" role="grid" aria-label={title} onMouseLeave={() => setHover('')}>
      {WEEKDAYS.map((d, i) => <span key={i} className="profit-cal-weekday" aria-hidden="true">{d}</span>)}
      {days.map(({ iso, day, outside }) => {
        const isStart = iso === preview.start;
        const isEnd = iso === preview.end;
        const inside = Boolean(preview.start && preview.end) && iso > preview.start && iso < preview.end;
        return <button key={iso} type="button" data-date={iso} aria-pressed={isStart || isEnd} aria-label={fmt(iso)}
          className={['profit-cal-day', outside && 'is-outside', iso === today && 'is-today', inside && 'is-inside', isStart && 'is-start', isEnd && 'is-end', isStart && !preview.end && 'is-single'].filter(Boolean).join(' ')}
          onMouseEnter={() => setHover(iso)} onClick={() => pick(iso)}>{day}</button>;
      })}
    </div>
    <p className="profit-cal-summary" aria-live="polite">{draft.start ? `${fmt(draft.start)}${draft.end ? ` – ${fmt(draft.end)}` : ' – elige la fecha final'}` : 'Elige la fecha inicial'}</p>
    <div className="profit-cal-actions">
      <button type="button" className="profit-outline" onClick={onCancel}>Cancelar</button>
      <button type="button" className="profit-primary" disabled={!draft.start || !draft.end} onClick={() => onApply(draft)}>Aplicar rango</button>
    </div>
  </div>;
}
