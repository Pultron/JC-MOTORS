import { useId } from 'react';
import { User } from 'lucide-react';
import type { QuoteFormData } from '../../models/quoteDraft';
import type { CustomerProfile } from '../../models/quotation';
import { Card } from './primitives/Card';
import { CardHeader } from './primitives/CardHeader';
import { PhoneInput } from '../ui/PhoneInput';
import { EmailInput } from '../ui/EmailInput';
import { FormRow, describedByFor } from './primitives/FormRow';
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
      <SearchCombobox label="Nombre" required testId="cliente-nombre" value={form.customerName} options={customers.map((customer) => ({ value: customer.id, label: customer.name, detail: `${customer.phone} ${customer.aliases.join(', ')}` }))} onChange={onCustomerChange} onSelect={onSelectCustomer} error={errors.customerName} onCommit={() => onCommitText('customerName')} searchIcon actionLabel="Crear nuevo cliente" onAction={() => onCustomerChange(form.customerName)} />
      <FormRow label="Teléfono" htmlFor={phoneId} optional filled={form.phone !== ''} error={errors.phone}>
        <PhoneInput id={phoneId} data-testid="cliente-telefono" className="mac-row-input" aria-invalid={Boolean(errors.phone)} aria-describedby={describedByFor(phoneId, errors.phone, true)} value={form.phone} onValueChange={(value) => onChange('phone', value)} onBlur={() => onBlurField('phone')} />
      </FormRow>
      <div className="overflow-hidden rounded-b-[14px]">
        <FormRow label="Correo" htmlFor={emailId} optional filled={form.email !== ''} error={errors.email}>
          <EmailInput id={emailId} data-testid="cliente-correo" anchorSelector=".mac-row" className="mac-row-input" aria-invalid={Boolean(errors.email)} aria-describedby={describedByFor(emailId, errors.email, true)} onBlur={() => onBlurField('email')} value={form.email} onValueChange={(value) => onChange('email', value)} />
        </FormRow>
      </div>
    </Card>
    <p className="px-4 pt-2 text-xs text-mac-ink-2">Selecciona un cliente o captura uno nuevo.</p>
  </div>;
}
