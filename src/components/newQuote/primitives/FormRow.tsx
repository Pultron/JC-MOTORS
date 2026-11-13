import type { ReactNode } from 'react';
import { FieldError, errorIdFor } from '../../ui/FieldError';

interface Props {
  label: string;
  htmlFor: string;
  required?: boolean;
  /** Shows "Opcional" on the right while the field is empty. Never combine with `required`. */
  optional?: boolean;
  /** True when the field already has text: hides "Opcional". */
  filled?: boolean;
  error?: string;
  children: ReactNode;
  /** Alinea el contenido arriba (para textarea). */
  tall?: boolean;
}

/** id of the "Opcional" hint, to be referenced by the control's aria-describedby. */
export const optionalIdFor = (fieldId: string) => `${fieldId}-optional`;

/** aria-describedby for a control: its error (when visible) and, for optional fields, the "Opcional" hint. */
export function describedByFor(fieldId: string, error?: string, optional?: boolean): string | undefined {
  return [errorIdFor(fieldId, error), optional ? optionalIdFor(fieldId) : undefined].filter(Boolean).join(' ') || undefined;
}

/** Fila agrupada estilo macOS: etiqueta fija de 88px + control sin borde. */
export function FormRow({ label, htmlFor, required, optional, filled, error, children, tall }: Props) {
  return <div>
    <div className={`mac-row ${tall ? 'items-start' : ''}`} data-invalid={error ? 'true' : undefined}>
      <label htmlFor={htmlFor} className={`w-[88px] flex-none text-sm text-mac-ink ${tall ? 'pt-3' : ''}`}>
        {label}{required && <span className="ml-0.5 text-mac-accent" aria-hidden="true">*</span>}
      </label>
      {children}
      {optional && !required && !filled && <span id={optionalIdFor(htmlFor)} data-testid="campo-opcional" className={`mac-row-optional ${tall ? 'pt-3' : ''}`}>Opcional</span>}
    </div>
    <FieldError id={`${htmlFor}-error`} message={error} className="px-4 pb-2 pt-1" />
  </div>;
}
