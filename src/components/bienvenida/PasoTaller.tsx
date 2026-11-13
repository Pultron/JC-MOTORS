import { useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { FieldError, errorIdFor } from '../ui/FieldError';
import { EmailInput } from '../ui/EmailInput';
import { PhoneInput } from '../ui/PhoneInput';
import { stripLineBreaks } from '../../validation/fields';
import { FRESH_FIELDS } from '../../services/welcomeFresh';
import type { FreshFormErrors, FreshFormValues } from '../../services/welcomeFresh';
import { focusFirstInvalid } from '../../utils/focusFirstInvalid';

interface Props {
  initial: FreshFormValues;
  /** Validation shared with the pure logic (services/welcomeFresh). */
  validate: (values: FreshFormValues) => FreshFormErrors;
  /** Saves and moves on. Resolves false when saving failed (the page already told the user). */
  onSubmit: (values: FreshFormValues) => Promise<boolean>;
  /** The JC-0001 note: the next folio according to the real counters. */
  nextFolio: string;
}

function Fila({ id, label, required, error, children }: { id: string; label: string; required?: boolean; error?: string; children: ReactNode }) {
  return <div>
    <div className="mac-row" data-invalid={error ? 'true' : undefined}>
      <label htmlFor={id} className="bv-row-label">{label}{required && <span className="ml-0.5 text-mac-accent" aria-hidden="true">*</span>}</label>
      {children}
    </div>
    <FieldError id={`${id}-error`} message={error} className="px-4 pb-2 pt-1" />
  </div>;
}

/** Step 2a: workshop data in settings-style grouped rows. */
export function PasoTaller({ initial, validate, onSubmit, nextFolio }: Props) {
  const ids = { nombre: useId(), telefono: useId(), calle: useId(), colonia: useId(), correo: useId() };
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<FreshFormValues>(initial);
  const [errors, setErrors] = useState<FreshFormErrors>({});
  const [saving, setSaving] = useState(false);

  const update = (key: (typeof FRESH_FIELDS)[number], value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const aria = (key: keyof typeof ids) => ({
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errorIdFor(ids[key], errors[key]),
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      window.requestAnimationFrame(() => focusFirstInvalid(formRef.current ?? document));
      return;
    }
    setSaving(true);
    const ok = await onSubmit(values);
    if (!ok) setSaving(false);
  }

  return <form ref={formRef} noValidate onSubmit={(event) => void handleSubmit(event)} data-testid="welcome-step-taller">
    <p className="bv-label">Empezar de cero</p>
    <h1 className="bv-title bv-title--md">Datos de tu taller</h1>
    <p className="bv-sub bv-sub--sm">Aparecen en tus cotizaciones. Podrás cambiarlos después.</p>
    <div className="bv-group">
      <Fila id={ids.nombre} label="Nombre" required error={errors.nombre}>
        <input id={ids.nombre} data-testid="welcome-nombre" className="mac-row-input" aria-required="true" {...aria('nombre')} value={values.nombre} maxLength={40} autoComplete="off" onChange={(event) => update('nombre', stripLineBreaks(event.target.value))} />
      </Fila>
      <Fila id={ids.telefono} label="Teléfono" required error={errors.telefono}>
        <PhoneInput id={ids.telefono} data-testid="welcome-telefono" className="mac-row-input" aria-required="true" {...aria('telefono')} value={values.telefono} onValueChange={(value) => update('telefono', value)} />
      </Fila>
      <Fila id={ids.calle} label="Calle y número" required error={errors.calle}>
        <input id={ids.calle} data-testid="welcome-calle" className="mac-row-input" autoComplete="off" aria-required="true" {...aria('calle')} value={values.calle} onChange={(event) => update('calle', stripLineBreaks(event.target.value))} />
      </Fila>
      <Fila id={ids.colonia} label="Colonia y ciudad" required error={errors.colonia}>
        <input id={ids.colonia} data-testid="welcome-colonia" className="mac-row-input" autoComplete="off" aria-required="true" {...aria('colonia')} value={values.colonia} onChange={(event) => update('colonia', stripLineBreaks(event.target.value))} />
      </Fila>
      <Fila id={ids.correo} label="Correo" error={errors.correo}>
        <EmailInput id={ids.correo} data-testid="welcome-correo" className="mac-row-input" anchorSelector=".mac-row" {...aria('correo')} value={values.correo} onValueChange={(value) => update('correo', value)} />
      </Fila>
    </div>
    <p className="bv-note">La primera cotización será {nextFolio}.</p>
    <div className="bv-actions" style={{ justifyContent: 'flex-end' }}>
      <button type="submit" className="bv-primary" data-testid="welcome-comenzar" disabled={saving}>Comenzar →</button>
    </div>
  </form>;
}
