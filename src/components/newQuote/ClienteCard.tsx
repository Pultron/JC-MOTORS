import { useId } from 'react';
import { User } from 'lucide-react';
import type { QuoteFormData } from '../../models/quoteDraft';
import type { CustomerProfile } from '../../models/quotation';
import { Card } from './primitives/Card';
import { CardHeader } from './primitives/CardHeader';
import { PHONE_MAX_LENGTH, phoneFromPaste, sanitizePhoneInput } from '../../validation/fields';
import { errorIdFor } from '../ui/FieldError';
import { FormRow } from './primitives/FormRow';
import { SearchCombobox } from './SearchCombobox';

interface Props {
  form: QuoteFormData;
  errors: Record<string, string>;
  customers: CustomerProfile[];
  onChange: <K extends keyof QuoteFormData>(key: K, value: QuoteFormData[K]) => void;
  onCustomerChange: (value: string) => void;
  onSelectCustomer: (id: string) => void;
  onBlurField: (key: 'phone' | 'email') => void;
  onCommitText: (key: 'customerName') => void;
}

export function ClienteCard({ form, errors, customers, onChange, onCustomerChange, onSelectCustomer, onBlurField, onCommitText }: Props) {
  const phoneId = useId();
  const emailId = useId();
  return <div className="min-w-0 flex-[1_1_280px]">
    <Card allowOverflow>
      <CardHeader icon={<User size={18} />} title="Datos del cliente" />
      <SearchCombobox label="Nombre" required testId="cliente-nombre" value={form.customerName} options={customers.map((customer) => ({ value: customer.id, label: customer.name, detail: `${customer.phone} ${customer.aliases.join(', ')}` }))} onChange={onCustomerChange} onSelect={onSelectCustomer} error={errors.customerName} onCommit={() => onCommitText('customerName')} placeholder="Buscar por nombre o teléfono" actionLabel="Crear nuevo cliente" onAction={() => onCustomerChange(form.customerName)} />
      <FormRow label="Teléfono" htmlFor={phoneId} error={errors.phone}>
        <input id={phoneId} data-testid="cliente-telefono" type="tel" className="mac-row-input" aria-invalid={Boolean(errors.phone)} aria-describedby={errorIdFor(phoneId, errors.phone)} value={form.phone} inputMode="tel" maxLength={PHONE_MAX_LENGTH} onChange={(event) => onChange('phone', sanitizePhoneInput(event.target.value))} onPaste={(event) => {
          // A pasted "+52 (667) 351-8806" is longer than maxLength, so the paste is resolved here instead of being truncated.
          event.preventDefault();
          const input = event.currentTarget;
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? start;
          onChange('phone', phoneFromPaste(input.value.slice(0, start) + event.clipboardData.getData('text') + input.value.slice(end)));
        }} onBlur={() => onBlurField('phone')} placeholder="10 dígitos, sin lada internacional" />
      </FormRow>
      <div className="overflow-hidden rounded-b-[14px]">
        <FormRow label="Correo" htmlFor={emailId} error={errors.email}>
          <input id={emailId} data-testid="cliente-correo" type="email" className="mac-row-input" aria-invalid={Boolean(errors.email)} aria-describedby={errorIdFor(emailId, errors.email)} onBlur={() => onBlurField('email')} value={form.email} onChange={(event) => onChange('email', event.target.value)} placeholder="cliente@correo.com" />
        </FormRow>
      </div>
    </Card>
    <p className="px-4 pt-2 text-xs text-mac-ink-2">Selecciona un cliente o captura uno nuevo.</p>
  </div>;
}
