import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { FloatingPanel } from '../ui/FloatingPanel';
import { OptionList, optionId } from '../ui/OptionList';
import { FormRow, describedByFor } from './primitives/FormRow';

export interface ComboOption {
  value: string;
  label: string;
  detail?: string;
  badges?: string[];
}

interface Props {
  label: string;
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  placeholder?: string;
  /** Lupa a la izquierda del campo en lugar de un texto de ayuda. */
  searchIcon?: boolean;
  optional?: boolean;
  inputMode?: 'numeric' | 'text';
  maxLength?: number;
  error?: string;
  required?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  testId?: string;
  /** Called when focus leaves the field (not when it moves to the option list). */
  onCommit?: () => void;
  /** La lista solo se abre desde un control externo o con ↓, nunca al enfocar o escribir. */
  manualOpen?: boolean;
  /** Estado de apertura controlado por el padre (botón externo). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-MX');

/** Combobox con búsqueda, presentado como fila agrupada estilo macOS. */
export function SearchCombobox({ label, value, options, onChange, onSelect, placeholder, searchIcon, optional, inputMode, maxLength, error, required, actionLabel, onAction, disabled, testId, onCommit, manualOpen, open: openProp, onOpenChange }: Props) {
  const inputId = useId();
  const listId = `${inputId}-options`;
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const [active, setActive] = useState(0);
  const [viaKeyboard, setViaKeyboard] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  useEffect(() => { if (!open) setQuery(''); }, [open]);
  // In manual mode the list has its own mini search field and never reads the form field.
  const filterText = manualOpen ? query : value;
  const visible = useMemo(() => options.filter((option) => normalize(`${option.label} ${option.detail ?? ''} ${(option.badges ?? []).join(' ')}`).includes(normalize(filterText))).slice(0, 40), [options, filterText]);

  function choose(next: string) {
    (onSelect ?? onChange)(next);
    setOpen(false);
    setActive(0);
  }

  function move(next: number) {
    setViaKeyboard(true);
    setActive(next);
  }

  function onNavKey(event: React.KeyboardEvent) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); move(Math.min(active + 1, visible.length - 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); move(Math.max(active - 1, 0)); }
    if (event.key === 'Enter' && open && visible[active]) { event.preventDefault(); choose(visible[active].value); }
  }

  return <div ref={root}>
    <FormRow label={label} htmlFor={inputId} required={required} optional={optional} filled={value !== ''} error={error}>
      {searchIcon && <Search size={15} aria-hidden="true" className="mac-row-lead" />}
      <input ref={input} id={inputId} data-testid={testId} role="combobox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && visible[active] ? optionId(listId, active) : undefined} aria-autocomplete="list" aria-invalid={Boolean(error)} aria-describedby={describedByFor(inputId, error, optional)} aria-required={required} disabled={disabled} className="mac-row-input" inputMode={inputMode} maxLength={maxLength} value={value} placeholder={placeholder} autoComplete="off"
        onFocus={() => { if (!manualOpen) setOpen(true); }} onBlur={(event) => { if (!root.current?.contains(event.relatedTarget)) { setOpen(false); onCommit?.(); } }}
        onChange={(event) => { onChange(event.target.value); if (!manualOpen) setOpen(true); setActive(0); }}
        onKeyDown={onNavKey} />
    </FormRow>
    <FloatingPanel open={open && !disabled} anchor={input.current?.closest<HTMLElement>('.mac-row') ?? null} inset={12} keepFocus={!manualOpen}>
      {manualOpen && <div className="mac-option-search">
        <Search size={14} aria-hidden="true" />
        <input autoFocus type="search" role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={visible[active] ? optionId(listId, active) : undefined} aria-label={`Buscar ${label.toLowerCase()}`} placeholder="Buscar por nombre, teléfono o apodo" autoComplete="off" value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={onNavKey} onBlur={() => setOpen(false)} />
      </div>}
      <div onMouseDown={manualOpen ? (event) => event.preventDefault() : undefined}>
        <OptionList id={listId} items={visible} activeIndex={active} selectedValue={value} label={label} scrollToActive={viaKeyboard}
          onPick={(index) => choose(visible[index].value)} onActive={(index) => { setViaKeyboard(false); setActive(index); }} />
        {visible.length === 0 && <p className="mac-option-empty">{manualOpen ? 'No encontramos ese cliente.' : 'Sin coincidencias. Puedes escribir el valor manualmente.'}</p>}
        {onAction && <button type="button" className="mac-option-action mac-press" onClick={() => { onAction(); setOpen(false); }}>{actionLabel}</button>}
      </div>
    </FloatingPanel>
  </div>;
}
