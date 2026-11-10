import { useId } from 'react';
import { Car } from 'lucide-react';
import type { QuoteFormData } from '../../models/quoteDraft';
import { getVehicleModels, vehicleBrands } from '../../services/vehicleCatalog';
import { MAX_YEAR, MIN_YEAR, sanitizePlatesInput } from '../../validation/fields';
import { errorIdFor } from '../ui/FieldError';
import { Select } from '../ui/Select';
import { Card } from './primitives/Card';
import { CardHeader } from './primitives/CardHeader';
import { FormRow } from './primitives/FormRow';
import { SearchCombobox } from './SearchCombobox';

interface Props {
  form: QuoteFormData;
  errors: Record<string, string>;
  onChange: <K extends keyof QuoteFormData>(key: K, value: QuoteFormData[K]) => void;
  onBlurField: (key: 'plates') => void;
  onCommitText: (key: 'make' | 'model') => void;
}

export function VehiculoCard({ form, errors, onChange, onBlurField, onCommitText }: Props) {
  const yearId = useId();
  const platesId = useId();
  const models = getVehicleModels(form.make);
  const years = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, index) => String(MAX_YEAR - index));
  // Cotizaciones antiguas pueden traer un año fuera del rango: se sigue mostrando, pero no se puede guardar así.
  if (form.year && !years.includes(form.year)) years.push(form.year);
  years.sort((a, b) => Number(b) - Number(a));
  const selectMake = (value: string) => { onChange('make', value); onChange('model', ''); };

  return <div className="min-w-0 flex-[1_1_280px]">
    <Card allowOverflow>
      <CardHeader icon={<Car size={18} />} title="Datos del vehículo" />
      <SearchCombobox label="Marca" required testId="vehiculo-marca" value={form.make} options={vehicleBrands.map((brand) => ({ value: brand, label: brand }))} onChange={selectMake} onSelect={selectMake} error={errors.make} onCommit={() => onCommitText('make')} placeholder="Busca o escribe" />
      <SearchCombobox label="Modelo" required testId="vehiculo-modelo" value={form.model} options={models.map((model) => ({ value: model, label: model }))} onChange={(value) => onChange('model', value)} error={errors.model} onCommit={() => onCommitText('model')} placeholder="Busca o escribe" />
      <FormRow label="Año" htmlFor={yearId} error={errors.year}>
        <Select id={yearId} testId="vehiculo-anio" variant="row" invalid={Boolean(errors.year)} describedBy={errorIdFor(yearId, errors.year)} value={form.year} onChange={(value) => onChange('year', value)} placeholder="Seleccionar año" options={years.map((year) => ({ value: year, label: year }))} />
      </FormRow>
      <div className="overflow-hidden rounded-b-[14px]">
        <FormRow label="Placas" htmlFor={platesId} error={errors.plates}>
          <input id={platesId} data-testid="vehiculo-placas" className="mac-row-input uppercase" aria-invalid={Boolean(errors.plates)} aria-describedby={errorIdFor(platesId, errors.plates)} onBlur={() => onBlurField('plates')} value={form.plates} maxLength={16} onChange={(event) => onChange('plates', sanitizePlatesInput(event.target.value))} placeholder="ABC-123-A" />
        </FormRow>
      </div>
    </Card>
    <p className="px-4 pt-2 text-xs text-mac-ink-2">El modelo se actualiza según la marca.</p>
  </div>;
}
