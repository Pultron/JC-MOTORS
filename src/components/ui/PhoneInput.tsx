import { useLayoutEffect, useRef } from 'react';
import type { ChangeEvent, InputHTMLAttributes } from 'react';
import { editPhone } from '../../validation/liveFormat';
import type { PhoneEditKind } from '../../validation/liveFormat';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode' | 'maxLength'> {
  value: string;
  onValueChange: (value: string) => void;
}

/** Phone field that shows "(667) 351-8806" while typing, keeps the caret where the user is and handles pasted +52 numbers. */
export function PhoneInput({ value, onValueChange, ...inputProps }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  // React moves the caret to the end when it rewrites the value, so it is restored after every render that follows an edit.
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    const input = ref.current;
    pendingCaret.current = null;
    if (caret !== null && input && document.activeElement === input) input.setSelectionRange(caret, caret);
  });

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const inputType = (event.nativeEvent as InputEvent).inputType ?? '';
    const kind: PhoneEditKind = inputType === 'deleteContentBackward' ? 'backward' : inputType === 'deleteContentForward' ? 'forward' : 'other';
    const edit = editPhone(value, input.value, input.selectionStart ?? input.value.length, kind);
    if (edit.value === value) {
      // Nothing to re-render (extra digit, letter): put the DOM back by hand.
      input.value = edit.value;
      input.setSelectionRange(edit.caret, edit.caret);
      return;
    }
    pendingCaret.current = edit.caret;
    onValueChange(edit.value);
  }

  return <input {...inputProps} ref={ref} type="tel" inputMode="tel" autoComplete="off" value={value} onChange={handleChange} />;
}
