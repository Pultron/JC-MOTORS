import { useLayoutEffect, useRef } from 'react';
import type { ChangeEvent, InputHTMLAttributes } from 'react';
import { sanitizePlatesInput } from '../../validation/fields';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

/** Plates field: uppercases while typing without sending the caret to the end when the edit is in the middle. */
export function PlatesInput({ value, onValueChange, ...inputProps }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    const input = ref.current;
    pendingCaret.current = null;
    if (caret !== null && input && document.activeElement === input) input.setSelectionRange(caret, caret);
  });

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const next = sanitizePlatesInput(input.value);
    const caret = sanitizePlatesInput(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
    if (next === value) {
      input.value = next;
      input.setSelectionRange(caret, caret);
      return;
    }
    pendingCaret.current = caret;
    onValueChange(next);
  }

  return <input {...inputProps} ref={ref} value={value} onChange={handleChange} />;
}
