import { useId } from 'react';
import { FileText } from 'lucide-react';
import type { QuoteFormData } from '../../models/quoteDraft';
import { Card } from './primitives/Card';
import { CardHeader } from './primitives/CardHeader';
import { FormRow, describedByFor } from './primitives/FormRow';
import { Segmented } from './primitives/Segmented';

interface Props {
  form: QuoteFormData;
  errors: Record<string, string>;
  onChange: <K extends keyof QuoteFormData>(key: K, value: QuoteFormData[K]) => void;
}

const validityOptions = [
  { value: '7', label: '7 días' },
  { value: '15', label: '15 días' },
  { value: '30', label: '30 días' },
];

export function DetallesCard({ form, errors, onChange }: Props) {
  const notesId = useId();
  const legacyId = useId();
  return <Card delayMs={140}>
    <CardHeader icon={<FileText size={18} />} title="Detalles adicionales" subtitle="Información pública que verá el cliente." />
    <FormRow label="Notas" htmlFor={notesId} optional filled={form.customerNotes !== ''} tall>
      <textarea id={notesId} data-testid="detalles-notas" aria-describedby={describedByFor(notesId, undefined, true)} rows={3} className="mac-row-input h-auto resize-y py-3" value={form.customerNotes} onChange={(event) => onChange('customerNotes', event.target.value)} placeholder="Observaciones para el cliente" />
    </FormRow>
    {form.publicNotes && <FormRow label="Públicas" htmlFor={legacyId} tall>
      <textarea id={legacyId} rows={2} className="mac-row-input h-auto resize-y py-3" value={form.publicNotes} onChange={(event) => onChange('publicNotes', event.target.value)} />
    </FormRow>}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-mac-separator px-4 py-2">
      <span className="w-[88px] flex-none text-sm">Vigencia</span>
      <Segmented ariaLabel="Vigencia de la cotización" testId="detalles-vigencia" options={validityOptions} value={form.validityDays} onChange={(value) => onChange('validityDays', value)} />
      {errors.validityDays && <p role="alert" className="w-full text-xs font-medium text-mac-danger">{errors.validityDays}</p>}
    </div>
  </Card>;
}
