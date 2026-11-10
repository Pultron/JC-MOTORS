import { useRef } from 'react';

interface Props {
  /** Id the field points at with aria-describedby while the message is visible. */
  id: string;
  message?: string;
  className?: string;
}

/** Inline field error. The slot animates open/closed so the form does not jump (no motion under prefers-reduced-motion). */
export function FieldError({ id, message, className = '' }: Props) {
  const last = useRef('');
  if (message) last.current = message;
  return <div className="mac-field-error" data-open={message ? 'true' : 'false'}>
    <div>
      <p id={id} role={message ? 'alert' : undefined} aria-hidden={message ? undefined : true} className={`text-xs font-medium text-mac-danger ${className}`}>{message || last.current}</p>
    </div>
  </div>;
}

/** aria-describedby value for a field whose FieldError uses `${fieldId}-error`. */
export function errorIdFor(fieldId: string, error?: string): string | undefined {
  return error ? `${fieldId}-error` : undefined;
}
