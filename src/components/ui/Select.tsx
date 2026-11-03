import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';
import { OptionList, optionId, type ListItem } from './OptionList';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Texto de la opción vacía ("Seleccionar año"); se muestra primero, con separador. */
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  invalid?: boolean;
  disabled?: boolean;
  testId?: string;
  /** "row" encaja en una fila agrupada; "plain" deja el aspecto al className. */
  variant?: 'row' | 'plain';
  className?: string;
  leading?: ReactNode;
}

/** Reemplazo del <select> nativo con lista flotante estilo macOS y teclado completo. */
export function Select({ value, onChange, options, placeholder, id, ariaLabel, invalid, disabled, testId, variant = 'plain', className = '', leading }: Props) {
  const fallbackId = useId();
  const triggerId = id ?? fallbackId;
  const listId = `${triggerId}-list`;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [viaKeyboard, setViaKeyboard] = useState(false);

  const items = useMemo<ListItem[]>(() => placeholder === undefined ? options : [{ value: '', label: placeholder, separatorAfter: true }, ...options], [options, placeholder]);
  const selected = items.find((item) => item.value === value);
  const anchor = variant === 'row' ? trigger.current?.closest<HTMLElement>('.mac-row') ?? trigger.current : trigger.current;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  /** Con teclado la opción activa arranca en la seleccionada; con puntero no hay resalte hasta pasar el cursor. */
  function show(withKeyboard: boolean) {
    const index = items.findIndex((item) => item.value === value);
    setActive(withKeyboard ? Math.max(index, 0) : -1);
    setViaKeyboard(withKeyboard);
    setOpen(true);
  }

  function pick(index: number) {
    const item = items[index];
    if (item) onChange(item.value);
    setOpen(false);
    trigger.current?.focus();
  }

  function move(next: number) {
    setViaKeyboard(true);
    setActive(Math.min(Math.max(next, 0), items.length - 1));
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const { key } = event;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) { event.preventDefault(); show(true); }
      return;
    }
    if (key === 'ArrowDown') { event.preventDefault(); move(active + 1); }
    else if (key === 'ArrowUp') { event.preventDefault(); move(active - 1); }
    else if (key === 'Home') { event.preventDefault(); move(0); }
    else if (key === 'End') { event.preventDefault(); move(items.length - 1); }
    else if (key === 'Enter' || key === ' ') { event.preventDefault(); pick(active); }
    else if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    else if (key === 'Tab') setOpen(false);
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      typed.current = { text: now - typed.current.at > 700 ? key : typed.current.text + key, at: now };
      const needle = typed.current.text.toLocaleLowerCase('es-MX');
      const index = items.findIndex((item) => item.label.toLocaleLowerCase('es-MX').startsWith(needle));
      if (index >= 0) move(index);
    }
  }

  const base = variant === 'row' ? 'mac-row-input' : '';
  return <>
    <button ref={trigger} id={triggerId} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-activedescendant={open && active >= 0 ? optionId(listId, active) : undefined} aria-label={ariaLabel} aria-invalid={invalid || undefined} disabled={disabled} data-testid={testId} data-value={value}
      className={`mac-select-trigger ${base} ${className}`} onClick={() => (open ? setOpen(false) : show(false))} onKeyDown={onKeyDown} onBlur={() => setOpen(false)}>
      {leading}
      <span className={`min-w-0 flex-1 truncate text-left ${value === '' ? 'text-mac-ink-2' : ''}`}>{selected?.label ?? placeholder ?? ''}</span>
      <ChevronsUpDown size={14} aria-hidden="true" className="flex-none text-mac-ink-2" />
    </button>
    <FloatingPanel open={open} anchor={anchor ?? null} inset={variant === 'row' ? 12 : 0} panelRef={panel}>
      <OptionList id={listId} items={items} activeIndex={active} selectedValue={value} scrollToActive={viaKeyboard}
        onPick={pick} onActive={(index) => { setViaKeyboard(false); setActive(index); }} />
    </FloatingPanel>
  </>;
}
