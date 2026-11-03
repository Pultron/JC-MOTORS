import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, ChevronsUpDown, SlidersHorizontal } from 'lucide-react';

export interface StatusOption {
  value: string;
  label: string;
  count: number;
}

interface StatusComboProps {
  value: string;
  options: StatusOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}

/** Reemplazo del <select> nativo: pop-up button de macOS con menú translúcido y conteos. */
export function StatusCombo({ value, options, open, onOpenChange, onChange }: StatusComboProps) {
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [highlight, setHighlight] = useState(selectedIndex);
  const current = options[selectedIndex];

  function show() {
    setHighlight(selectedIndex);
    onOpenChange(true);
  }

  function choose(index: number) {
    onChange(options[index].value);
    onOpenChange(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { show(); return; }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((index) => (index + step + options.length) % options.length);
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      choose(highlight);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
    } else if (event.key === 'Tab' && open) {
      onOpenChange(false);
    }
  }

  return (
    <div className="hi-pop">
      <button
        type="button"
        className="hi-ctl hi-ctl--status"
        data-testid="hi-status"
        role="combobox"
        aria-label="Filtrar por estado"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${highlight}` : undefined}
        onClick={() => (open ? onOpenChange(false) : show())}
        onKeyDown={handleKeyDown}
      >
        <SlidersHorizontal size={15} aria-hidden="true" className="hi-ctl-lead" />
        <span className="hi-ctl-text">{current.label}</span>
        <ChevronsUpDown size={12} aria-hidden="true" className="hi-ctl-chev" />
      </button>
      {open && (
        <div className="hi-menu hi-menu--status" id={listId} role="listbox" aria-label="Estado" data-testid="hi-status-menu">
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              data-value={option.value}
              data-testid="hi-status-option"
              data-highlighted={index === highlight}
              className="hi-option"
              onMouseEnter={() => setHighlight(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <span className="hi-option-check" aria-hidden="true">
                {option.value === value && <Check size={13} strokeWidth={3} className="hi-draw" />}
              </span>
              <span className="hi-option-label">{option.label}</span>
              <span className="hi-option-count">{option.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
