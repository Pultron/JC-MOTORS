import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { FloatingPanel } from './FloatingPanel';
import {
  applySuggestion, buildSuggestions, handleSuggestKey, initialSuggestState, isOpen, onTextChange,
} from '../../validation/emailSuggestions';
import type { Suggestion, SuggestState } from '../../validation/emailSuggestions';
import { stripLineBreaks } from '../../validation/fields';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'role'> {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  /** CSS selector of the ancestor the popover aligns to (defaults to the input itself). */
  anchorSelector?: string;
}

const optionId = (id: string, index: number) => `${id}-suggest-${index}`;

/**
 * Email input with a macOS-style popover under the field that completes the domain ("juan@g" -> gmail.com) and flags
 * likely typos ("gmial.com"). It never edits the text by itself: only Tab/Enter on an active item or a click applies it.
 * All validation, aria wiring and blur handling stay with the caller through the regular input props.
 */
export function EmailInput({ id, value, onValueChange, anchorSelector, onBlur, onFocus, onKeyDown, ...inputProps }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<SuggestState>(initialSuggestState);
  const [focused, setFocused] = useState(false);
  const pendingCaret = useRef(false);
  const items = useMemo(() => buildSuggestions(value), [value]);
  const open = focused && isOpen(state, value, items);
  const active = state.active >= 0 && state.active < items.length ? state.active : -1;
  const listId = `${id}-suggestions`;
  const typo = items.find((item) => item.kind === 'typo');

  // After accepting, the caret goes to the end (type="email" inputs can refuse selection APIs, hence the guard).
  useLayoutEffect(() => {
    if (!pendingCaret.current) return;
    pendingCaret.current = false;
    const input = inputRef.current;
    if (!input) return;
    try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* The browser already leaves the caret at the end. */ }
  }, [value]);

  function change(next: string) {
    const clean = stripLineBreaks(next);
    setState(onTextChange(buildSuggestions(clean)));
    onValueChange(clean);
  }

  function accept(suggestion: Suggestion) {
    const next = applySuggestion(value, suggestion);
    pendingCaret.current = true;
    setState(onTextChange(buildSuggestions(next)));
    onValueChange(next);
    inputRef.current?.focus();
  }

  return <>
    <input
      {...inputProps}
      ref={inputRef}
      id={id}
      type="email"
      role="combobox"
      aria-autocomplete="list"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open && active >= 0 ? optionId(id, active) : undefined}
      autoComplete="off"
      value={value}
      onChange={(event) => change(event.target.value)}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const result = handleSuggestKey(state, { key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode }, value, items);
        if (result.preventDefault) event.preventDefault();
        if (result.stopPropagation) event.stopPropagation();
        setState(result.state);
        if (result.accept) accept(result.accept);
      }}
    />
    {open && typo && <span role="status" className="sr-only">¿Quisiste decir {typo.domain}?</span>}
    <FloatingPanel open={open} anchor={anchorSelector ? inputRef.current?.closest<HTMLElement>(anchorSelector) ?? inputRef.current : inputRef.current} inset={12} maxHeight={248} className="jc-suggest-pop">
      <ul id={listId} role="listbox" aria-label="Sugerencias de correo" className="mac-options">
        {items.map((item, index) => <li
          key={`${item.kind}-${item.domain}`}
          id={optionId(id, index)}
          role="option"
          aria-selected={index === active}
          data-active={index === active ? 'true' : undefined}
          data-kind={item.kind}
          data-testid={`email-sugerencia-${index}`}
          className="mac-option"
          onMouseMove={() => { if (index !== state.active) setState((current) => ({ ...current, active: index })); }}
          onClick={() => accept(item)}
        >
          {item.kind === 'typo'
            ? <><span className="min-w-0 flex-1">¿Quisiste decir <strong>{item.domain}</strong>?</span><span className="jc-suggest-apply" aria-hidden="true">Aplicar</span></>
            : <span className="min-w-0 flex-1 truncate">{value.slice(0, value.indexOf('@') + 1)}<strong>{item.domain}</strong></span>}
        </li>)}
      </ul>
    </FloatingPanel>
  </>;
}
