import type { ReactNode } from 'react';
import { Box, CarFront, Plus, ReceiptText, Trash2, UserRound } from 'lucide-react';
import { SectionCard } from '../SectionCard';
import type { QuoteDraftItem, QuoteFormData } from '../../models/quoteDraft';
import type { CustomerProfile } from '../../models/quotation';
import { getVehicleModels, vehicleBrands } from '../../services/vehicleCatalog';
import { formatCurrency, roundCurrency } from '../../utils/quotation';
import { SearchCombobox } from './SearchCombobox';

type Change = <K extends keyof QuoteFormData>(key: K, value: QuoteFormData[K]) => void;

export function ClientVehicleSection({ form, errors, customers, onChange, onCustomerChange, onSelectCustomer }: {
  form: QuoteFormData; errors: Record<string, string>; customers: CustomerProfile[];
  onChange: Change; onCustomerChange: (value: string) => void; onSelectCustomer: (id: string) => void;
}) {
  const models = getVehicleModels(form.make);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear + 2 - 1980 }, (_, index) => String(currentYear + 1 - index));
  return <SectionCard className="quote-section" title="Cliente y vehículo" icon={<UserRound size={21} />}>
    <div className="quote-client-content">
      <div className="quote-client-grid">
        <div className="quote-customer-fields">
          <div className="quote-subheading"><UserRound size={20} /><div><h3>Datos del cliente</h3><p>Selecciona un cliente o captura uno nuevo.</p></div></div>
          <SearchCombobox label="Nombre completo *" value={form.customerName} options={customers.map((customer) => ({ value: customer.id, label: customer.name, detail: `${customer.phone} ${customer.aliases.join(', ')}` }))} onChange={onCustomerChange} onSelect={onSelectCustomer} error={errors.customerName} placeholder="Buscar por nombre o teléfono" actionLabel="Crear nuevo cliente" onAction={() => onCustomerChange(form.customerName)} />
          <div className="quote-paired-fields">
            <Field label="Teléfono / WhatsApp" error={errors.phone}><input className={inputClass(errors.phone)} value={form.phone} inputMode="tel" maxLength={25} onChange={(event) => onChange('phone', event.target.value.replace(/[^+\d\s()\-]/g, ''))} placeholder="55 1234 5678" /></Field>
            <Field label="Correo electrónico" error={errors.email}><input className={inputClass(errors.email)} type="email" value={form.email} onChange={(event) => onChange('email', event.target.value)} placeholder="cliente@correo.com" /></Field>
          </div>
        </div>
        <div className="quote-vehicle-fields">
          <div className="quote-subheading"><CarFront size={20} /><div><h3>Datos del vehículo</h3><p>El modelo se actualiza según la marca.</p></div></div>
          <div className="quote-paired-fields">
            <SearchCombobox label="Marca *" value={form.make} options={vehicleBrands.map((brand) => ({ value: brand, label: brand }))} onChange={(value) => { onChange('make', value); onChange('model', ''); }} onSelect={(value) => { onChange('make', value); onChange('model', ''); }} error={errors.make} placeholder="Busca o escribe una marca" />
            <SearchCombobox label="Modelo *" value={form.model} options={models.map((model) => ({ value: model, label: model }))} onChange={(value) => onChange('model', value)} error={errors.model} placeholder="Busca o escribe un modelo" />
            <SearchCombobox label="Año" value={form.year} options={yearOptions.map((year) => ({ value: year, label: year }))} onChange={(value) => onChange('year', value.replace(/[^\d]/g, '').slice(0, 4))} error={errors.year} placeholder="Seleccionar año" />
            <Field label="Placas"><input className="form-input uppercase" value={form.plates} maxLength={16} onChange={(event) => onChange('plates', event.target.value.toLocaleUpperCase('es-MX'))} placeholder="ABC-123-A" /></Field>
          </div>
        </div>
      </div>
    </div>
  </SectionCard>;
}

export function QuoteItemsSection({ form, errors, suggestions, onAdd, onUpdate, onDelete }: {
  form: QuoteFormData; errors: Record<string, string>; suggestions: string[];
  onAdd: (description?: string) => void;
  onUpdate: (id: string, key: keyof Omit<QuoteDraftItem, 'id' | 'type'>, value: string) => void;
  onDelete: (id: string) => void;
}) {
  return <SectionCard className="quote-section" title="Refacciones y materiales" description="Agrega las refacciones y materiales a cotizar." icon={<Box size={21} />}>
    <div className="quote-items-content">
      <div className="quote-item-list">
        {form.items.map((item, index) => <div key={item.id} className="quote-item-row">
          <Field className="quote-item-description" label="Descripción" error={errors[`item-${item.id}-description`]}><input aria-label={`Descripción de la refacción ${index + 1}`} className={inputClass(errors[`item-${item.id}-description`])} value={item.description} list={`concepts-${item.id}`} onChange={(event) => onUpdate(item.id, 'description', event.target.value)} placeholder="Descripción de la refacción o material" /><datalist id={`concepts-${item.id}`}>{suggestions.map((description) => <option key={description} value={description} />)}</datalist></Field>
          <Field label="Cantidad" error={errors[`item-${item.id}-quantity`]}><input aria-label={`Cantidad de la refacción ${index + 1}`} className={inputClass(errors[`item-${item.id}-quantity`])} type="number" min="0.01" step="any" value={item.quantity} onChange={(event) => onUpdate(item.id, 'quantity', event.target.value)} /></Field>
          <Field label="Precio unitario" error={errors[`item-${item.id}-unitPrice`]}><input aria-label={`Precio unitario de la refacción ${index + 1}`} className={inputClass(errors[`item-${item.id}-unitPrice`])} type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => onUpdate(item.id, 'unitPrice', event.target.value)} placeholder="0.00" /></Field>
          <div className="quote-item-amount"><span className="quote-field-label">Importe</span><output aria-label={`Importe de la refacción ${index + 1}`}>{formatCurrency(roundCurrency(Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0)))}</output></div>
          <div className="quote-item-remove"><button type="button" className="icon-button text-slate-400 hover:text-rose-600" aria-label={`Eliminar refacción ${index + 1}`} onClick={() => onDelete(item.id)}><Trash2 size={17} /></button></div>
        </div>)}
      </div>
    </div>
    {errors.items && <p role="alert" className="mt-2 text-xs text-rose-600">{errors.items}</p>}
    <button type="button" className="quote-add-part" onClick={() => onAdd()}><Plus size={17} />Agregar refacción</button>
  </SectionCard>;
}

export function PublicNotesSection({ form, errors, onChange }: { form: QuoteFormData; errors: Record<string, string>; onChange: Change }) {
  return <SectionCard className="quote-section" title="Detalles adicionales" description="Información pública que verá el cliente." icon={<ReceiptText size={21} />}>
    <div className="quote-notes-grid">
      <Field label="Notas para el cliente"><textarea rows={1} className="form-input quote-notes-input" value={form.customerNotes} onChange={(event) => onChange('customerNotes', event.target.value)} placeholder="Ej. Observaciones, recomendaciones, etc." /></Field>
      <Field label="Vigencia de la cotización" error={errors.validityDays}><select className={inputClass(errors.validityDays)} value={form.validityDays} onChange={(event) => onChange('validityDays', event.target.value)}><option value="" disabled>Seleccionar vigencia</option><option value="7">7 días</option><option value="15">15 días</option><option value="30">30 días</option></select></Field>
      {form.publicNotes && <Field label="Observaciones públicas" className="quote-legacy-notes"><textarea rows={2} className="form-input resize-y" value={form.publicNotes} onChange={(event) => onChange('publicNotes', event.target.value)} /></Field>}
    </div>
  </SectionCard>;
}

function inputClass(error?: string) { return `form-input ${error ? '!border-rose-500' : ''}`; }
function Field({ label, children, error, className = '' }: { label: string; children: ReactNode; error?: string; className?: string }) {
  return <label className={`block min-w-0 ${className}`}><span className="quote-field-label">{label}</span>{children}{error && <span role="alert" className="mt-1 block text-xs font-medium text-rose-600">{error}</span>}</label>;
}
