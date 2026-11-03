import type { ReactNode } from 'react';

interface Props {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  /** Alinea el contenido arriba (para textarea). */
  tall?: boolean;
}

/** Fila agrupada estilo macOS: etiqueta fija de 88px + control sin borde. */
export function FormRow({ label, htmlFor, required, error, children, tall }: Props) {
  return <div>
    <div className={`mac-row ${tall ? 'items-start' : ''}`} data-invalid={error ? 'true' : undefined}>
      <label htmlFor={htmlFor} className={`w-[88px] flex-none text-sm text-mac-ink ${tall ? 'pt-3' : ''}`}>
        {label}{required && <span className="ml-0.5 text-mac-accent" aria-hidden="true">*</span>}
      </label>
      {children}
    </div>
    {error && <p role="alert" className="px-4 pb-2 pt-1 text-xs font-medium text-mac-danger">{error}</p>}
  </div>;
}
