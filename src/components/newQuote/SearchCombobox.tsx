import { useId, useMemo, useRef, useState } from 'react';
import { FloatingPanel } from '../ui/FloatingPanel';
import { OptionList, optionId } from '../ui/OptionList';
import { FormRow } from './primitives/FormRow';

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
  required?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  testId?: string;
}

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-MX');

/** Combobox con búsqueda, presentado como fila agrupada estilo macOS. */
export function SearchCombobox({ label, value, options, onChange, onSelect, placeholder, error, required, actionLabel, onAction, disabled, testId }: Props) {
  const inputId = useId();
  const listId = `${inputId}-options`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [viaKeyboard, setViaKeyboard] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => options.filter((option) => normalize(`${option.label} ${option.detail ?? ''}`).includes(normalize(value))).slice(0, 40), [options, value]);

  function choose(next: string) {
    (onSelect ?? onChange)(next);
    setOpen(false);
    setActive(0);
  }

  function move(next: number) {
    setViaKeyboard(true);
    setActive(next);
  }

  return <div ref={root}>
    <FormRow label={label} htmlFor={inputId} required={required} error={error}>
      <input ref={input} id={inputId} data-testid={testId} role="combobox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && visible[active] ? optionId(listId, active) : undefined} aria-autocomplete="list" aria-invalid={Boolean(error)} aria-required={required} disabled={disabled} className="mac-row-input" value={value} placeholder={placeholder} autoComplete="off"
        onFocus={() => setOpen(true)} onBlur={(event) => { if (!root.current?.contains(event.relatedTarget)) setOpen(false); }}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); move(Math.min(active + 1, visible.length - 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); move(Math.max(active - 1, 0)); }
          if (event.key === 'Enter' && open && visible[active]) { event.preventDefault(); choose(visible[active].value); }
        }} />
    </FormRow>
    <FloatingPanel open={open && !disabled} anchor={input.current?.closest<HTMLElement>('.mac-row') ?? null} inset={12}>
      <OptionList id={listId} items={visible} activeIndex={active} selectedValue={value} label={label} scrollToActive={viaKeyboard}
        onPick={(index) => choose(visible[index].value)} onActive={(index) => { setViaKeyboard(false); setActive(index); }} />
      {visible.length === 0 && <p className="mac-option-empty">Sin coincidencias. Puedes escribir el valor manualmente.</p>}
      {onAction && <button type="button" className="mac-option-action mac-press" onClick={() => { onAction(); setOpen(false); }}>{actionLabel}</button>}
    </FloatingPanel>
  </div>;
}
