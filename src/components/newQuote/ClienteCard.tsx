import { useId } from 'react';
import { User } from 'lucide-react';
import type { QuoteFormData } from '../../models/quoteDraft';
import type { CustomerProfile } from '../../models/quotation';
import { Card } from './primitives/Card';
import { CardHeader } from './primitives/CardHeader';
import { FormRow } from './primitives/FormRow';
import { SearchCombobox } from './SearchCombobox';

interface Props {
  form: QuoteFormData;
  errors: Record<string, string>;
  customers: CustomerProfile[];
  onChange: <K extends keyof QuoteFormData>(key: K, value: QuoteFormData[K]) => void;
  onCustomerChange: (value: string) => void;
  onSelectCustomer: (id: string) => void;
}

export function ClienteCard({ form, errors, customers, onChange, onCustomerChange, onSelectCustomer }: Props) {
  const phoneId = useId();
  const emailId = useId();
  return <div className="min-w-0 flex-[1_1_280px]">
    <Card allowOverflow>
      <CardHeader icon={<User size={18} />} title="Datos del cliente" />
      <SearchCombobox label="Nombre" required testId="cliente-nombre" value={form.customerName} options={customers.map((customer) => ({ value: customer.id, label: customer.name, detail: `${customer.phone} ${customer.aliases.join(', ')}` }))} onChange={onCustomerChange} onSelect={onSelectCustomer} error={errors.customerName} placeholder="Buscar por nombre o teléfono" actionLabel="Crear nuevo cliente" onAction={() => onCustomerChange(form.customerName)} />
      <FormRow label="Teléfono" htmlFor={phoneId} error={errors.phone}>
        <input id={phoneId} data-testid="cliente-telefono" type="tel" className="mac-row-input" aria-invalid={Boolean(errors.phone)} value={form.phone} inputMode="tel" maxLength={25} onChange={(event) => onChange('phone', event.target.value.replace(/[^+\d\s()-]/g, ''))} placeholder="55 1234 5678" />
      </FormRow>
      <div className="overflow-hidden rounded-b-[14px]">
        <FormRow label="Correo" htmlFor={emailId} error={errors.email}>
          <input id={emailId} data-testid="cliente-correo" type="email" className="mac-row-input" aria-invalid={Boolean(errors.email)} value={form.email} onChange={(event) => onChange('email', event.target.value)} placeholder="cliente@correo.com" />
        </FormRow>
      </div>
    </Card>
    <p className="px-4 pt-2 text-xs text-mac-ink-2">Selecciona un cliente o captura uno nuevo.</p>
  </div>;
}
