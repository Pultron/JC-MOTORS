import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface ComboOption {
  value: string;
  label: string;
  detail?: string;
}

interface Props {
  label: string;
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  placeholder?: string;
  error?: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX');

export function SearchCombobox({ label, value, options, onChange, onSelect, placeholder, error, actionLabel, onAction, disabled }: Props) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => options.filter((option) => normalize(`${option.label} ${option.detail ?? ''}`).includes(normalize(value))).slice(0, 40), [options, value]);

  function choose(next: string) {
    (onSelect ?? onChange)(next);
    setOpen(false);
    setActive(0);
  }

  return <div ref={root} className="relative min-w-0">
    <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</label>
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input id={inputId} role="combobox" aria-expanded={open} aria-controls={open ? `${inputId}-options` : undefined} aria-autocomplete="list" aria-invalid={Boolean(error)} disabled={disabled} className={`form-input pl-9 pr-9 ${error ? '!border-rose-500' : ''}`} value={value} placeholder={placeholder} autoComplete="off"
        onFocus={() => setOpen(true)} onBlur={(event) => { if (!root.current?.contains(event.relatedTarget)) setOpen(false); }}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, visible.length - 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
          if (event.key === 'Enter' && open && visible[active]) { event.preventDefault(); choose(visible[active].value); }
        }} />
      <button type="button" disabled={disabled} aria-label={`Mostrar opciones de ${label}`} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setOpen((current) => !current)}><ChevronDown size={16} /></button>
    </div>
    {error && <p role="alert" className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    {open && !disabled && <div id={`${inputId}-options`} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
      {visible.map((option, index) => <button key={option.value} role="option" aria-selected={index === active} type="button" className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${index === active ? 'bg-orange-50 text-orange-700' : 'text-slate-700 hover:bg-slate-50'}`} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option.value)}>{option.label}{option.detail && <span className="block text-xs text-slate-500">{option.detail}</span>}</button>)}
      {visible.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">Sin coincidencias. Puedes escribir el valor manualmente.</p>}
      {onAction && <button type="button" className="w-full rounded-lg border-t border-slate-100 px-3 py-2 text-left text-sm font-semibold text-blue-600 hover:bg-blue-50" onMouseDown={(event) => event.preventDefault()} onClick={() => { onAction(); setOpen(false); }}>{actionLabel}</button>}
    </div>}
  </div>;
}
