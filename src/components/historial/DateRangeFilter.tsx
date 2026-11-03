import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { CalendarDays, ChevronsUpDown, X } from 'lucide-react';
import { RangeCalendar } from '../internalControl/RangeCalendar';
import { rangeLabel } from '../../utils/dateRangeUtils';
import type { DateRange } from '../../utils/dateRangeUtils';

interface DateRangeFilterProps {
  value: DateRange;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (range: DateRange) => void;
}

const EMPTY: DateRange = { start: '', end: '' };

/** Filtro por rango de fechas: mismo calendario que Control interno y Facturas. */
export function DateRangeFilter({ value, open, onOpenChange, onChange }: DateRangeFilterProps) {
  const active = Boolean(value.start && value.end);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    onOpenChange(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="hi-pop" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="hi-ctl hi-ctl--range"
        data-testid="hi-range"
        data-active={active}
        aria-label="Filtrar por rango de fechas"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <CalendarDays size={15} aria-hidden="true" className="hi-ctl-lead" />
        <span className="hi-ctl-text" data-empty={!active}>{active ? rangeLabel(value) : 'Todas las fechas'}</span>
        {!active && <ChevronsUpDown size={12} aria-hidden="true" className="hi-ctl-chev" />}
      </button>
      {active && (
        <button type="button" className="hi-range-clear" data-testid="hi-range-clear" aria-label="Quitar filtro de fechas" onClick={() => onChange(EMPTY)}>
          <X size={14} aria-hidden="true" />
        </button>
      )}
      {open && (
        <RangeCalendar
          value={value}
          onCancel={() => onOpenChange(false)}
          onApply={(range) => { onChange(range); onOpenChange(false); }}
        />
      )}
    </div>
  );
}
