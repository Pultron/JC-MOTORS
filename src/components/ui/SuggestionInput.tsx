import { useId, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';
import { FloatingPanel } from './FloatingPanel';
import { OptionList, optionId } from './OptionList';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'role' | 'list'> {
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
}

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-MX');

/** Campo de texto libre con sugerencias; sustituye al <datalist> nativo con la lista estilo macOS. */
export function SuggestionInput({ value, suggestions, onChange, onKeyDown, onBlur, ...inputProps }: Props) {
  const listId = `${useId()}-suggestions`;
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [viaKeyboard, setViaKeyboard] = useState(false);
  const items = useMemo(() => {
    const needle = normalize(value.trim());
    return suggestions.filter((text) => normalize(text).includes(needle) && text !== value).slice(0, 30).map((text) => ({ value: text, label: text }));
  }, [suggestions, value]);
  const expanded = open && items.length > 0;

  function choose(index: number) {
    if (items[index]) onChange(items[index].value);
    setOpen(false);
  }

  return <>
    <input {...inputProps} ref={input} role="combobox" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-activedescendant={expanded ? optionId(listId, active) : undefined} aria-autocomplete="list" autoComplete="off" value={value}
      onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(0); }}
      onClick={() => { if (value === '') setOpen(true); }}
      onBlur={(event) => { setOpen(false); onBlur?.(event); }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        else if (event.key === 'ArrowDown') { event.preventDefault(); setViaKeyboard(true); setActive(open ? Math.min(active + 1, items.length - 1) : 0); setOpen(true); }
        else if (event.key === 'ArrowUp' && expanded) { event.preventDefault(); setViaKeyboard(true); setActive(Math.max(active - 1, 0)); }
        else if (event.key === 'Enter' && expanded) { event.preventDefault(); choose(active); }
      }} />
    <FloatingPanel open={expanded} anchor={input.current} minWidth={220}>
      <OptionList id={listId} items={items} activeIndex={active} selectedValue={value} scrollToActive={viaKeyboard}
        onPick={choose} onActive={(index) => { setViaKeyboard(false); setActive(index); }} />
    </FloatingPanel>
  </>;
}
