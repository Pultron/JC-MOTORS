import { Fragment, useEffect } from 'react';
import { Check } from 'lucide-react';

export interface ListItem {
  value: string;
  label: string;
  detail?: string;
  /** Dibuja un separador fino debajo de la opción. */
  separatorAfter?: boolean;
}

interface Props {
  id: string;
  items: ListItem[];
  activeIndex: number;
  selectedValue?: string;
  label?: string;
  /** True cuando el cambio de opción activa vino del teclado: hace scroll hasta ella. */
  scrollToActive: boolean;
  onPick: (index: number) => void;
  onActive: (index: number) => void;
}

export const optionId = (id: string, index: number) => `${id}-opt-${index}`;

/** Lista de opciones con el estilo macOS compartido por todos los selects y comboboxes. */
export function OptionList({ id, items, activeIndex, selectedValue, label, scrollToActive, onPick, onActive }: Props) {
  // Al abrir, deja visible la opción ya seleccionada aunque la lista sea larga.
  useEffect(() => {
    const index = items.findIndex((item) => item.value === selectedValue);
    if (index > 0) document.getElementById(optionId(id, index))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollToActive) document.getElementById(optionId(id, activeIndex))?.scrollIntoView({ block: 'nearest' });
  }, [id, activeIndex, scrollToActive]);

  return <ul id={id} role="listbox" aria-label={label} className="mac-options">
    {items.map((item, index) => <Fragment key={`${item.value}-${index}`}>
      <li id={optionId(id, index)} role="option" data-value={item.value} aria-selected={item.value === selectedValue} data-active={index === activeIndex ? 'true' : undefined} className="mac-option"
        onMouseMove={() => { if (index !== activeIndex) onActive(index); }} onClick={() => onPick(index)}>
        <span className="mac-option-check" aria-hidden="true">{item.value === selectedValue && <Check size={15} strokeWidth={2.4} />}</span>
        <span className="min-w-0 flex-1">{item.label}{item.detail && <span className="mac-option-detail">{item.detail}</span>}</span>
      </li>
      {item.separatorAfter && <li role="separator" className="mac-option-separator" />}
    </Fragment>)}
  </ul>;
}
