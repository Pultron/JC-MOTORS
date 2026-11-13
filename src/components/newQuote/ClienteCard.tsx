import { useId } from 'react';
import { useNavigate } from 'react-router';
import { User, Sparkles } from 'lucide-react';
import type { QuoteFormData } from '../../models/quoteDraft';
import type { CustomerProfile } from '../../models/quotation';
import { Card } from './primitives/Card';
import { CardHeader } from './primitives/CardHeader';
import { PhoneInput } from '../ui/PhoneInput';
import { EmailInput } from '../ui/EmailInput';
import { FormRow, describedByFor } from './primitives/FormRow';
import { showOptionalHint } from '../../validation/fields';
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
  const navigate = useNavigate();
  const typed = form.customerName.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-MX');
  const aliasMatch = !form.customerId && typed ? customers.find((customer) => customer.aliases.some((alias) => alias.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-MX') === typed)) : undefined;
  const phoneId = useId();
  const emailId = useId();
  const contact = { telefono: form.phone, correo: form.email };
  const phoneOptional = showOptionalHint('telefono', contact);
  const emailOptional = showOptionalHint('correo', contact);
  return <div className="min-w-0 flex-[1_1_280px]">
    <Card allowOverflow>
      <CardHeader icon={<User size={18} />} title="Datos del cliente" />
      <SearchCombobox label="Nombre" required testId="cliente-nombre" value={form.customerName} options={customers.map((customer) => ({ value: customer.id, label: customer.name, detail: customer.phone, badges: customer.aliases }))} onChange={onCustomerChange} onSelect={onSelectCustomer} error={errors.customerName} onCommit={() => onCommitText('customerName')} searchIcon openOnlyFromIcon actionLabel="Crear nuevo cliente" onAction={() => navigate('/clientes')} />
      {aliasMatch && <button type="button" className="cli-alias-suggest mac-press" data-testid="cliente-sugerencia-apodo" onClick={() => onSelectCustomer(aliasMatch.id)}>
        <Sparkles size={14} aria-hidden="true" />
        <span>¿Es <strong>{aliasMatch.name}</strong>? Autocompletar datos</span>
      </button>}
      <FormRow label="Teléfono" htmlFor={phoneId} optional={phoneOptional} error={errors.phone}>
        <PhoneInput id={phoneId} data-testid="cliente-telefono" className="mac-row-input" aria-invalid={Boolean(errors.phone)} aria-describedby={describedByFor(phoneId, errors.phone, phoneOptional)} value={form.phone} onValueChange={(value) => onChange('phone', value)} onBlur={() => onBlurField('phone')} />
      </FormRow>
      <div className="overflow-hidden rounded-b-[14px]">
        <FormRow label="Correo" htmlFor={emailId} optional={emailOptional} error={errors.email}>
          <EmailInput id={emailId} data-testid="cliente-correo" anchorSelector=".mac-row" className="mac-row-input" aria-invalid={Boolean(errors.email)} aria-describedby={describedByFor(emailId, errors.email, emailOptional)} onBlur={() => onBlurField('email')} value={form.email} onValueChange={(value) => onChange('email', value)} />
        </FormRow>
      </div>
    </Card>
    <p className="px-4 pt-2 text-xs text-mac-ink-2">Selecciona un cliente o captura uno nuevo.</p>
    <p className="px-4 pt-1 text-xs text-mac-ink-2" data-testid="contacto-ayuda">Captura al menos un medio de contacto: teléfono o correo.</p>
  </div>;
}
