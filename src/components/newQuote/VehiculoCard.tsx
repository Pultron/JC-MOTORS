import { useId } from 'react';
import { Car } from 'lucide-react';
import type { QuoteFormData } from '../../models/quoteDraft';
import { getVehicleModels, vehicleBrands } from '../../services/vehicleCatalog';
import { MAX_YEAR, MIN_YEAR } from '../../validation/fields';
import { PlatesInput } from '../ui/PlatesInput';
import { Card } from './primitives/Card';
import { CardHeader } from './primitives/CardHeader';
import { FormRow, describedByFor } from './primitives/FormRow';
import { SearchCombobox } from './SearchCombobox';

interface Props {
  form: QuoteFormData;
  errors: Record<string, string>;
  onChange: <K extends keyof QuoteFormData>(key: K, value: QuoteFormData[K]) => void;
  onBlurField: (key: 'plates') => void;
  onCommitText: (key: 'make' | 'model') => void;
}

export function VehiculoCard({ form, errors, onChange, onBlurField, onCommitText }: Props) {
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
      <SearchCombobox label="Marca" required testId="vehiculo-marca" value={form.make} options={vehicleBrands.map((brand) => ({ value: brand, label: brand }))} onChange={selectMake} onSelect={selectMake} error={errors.make} onCommit={() => onCommitText('make')} searchIcon />
      <SearchCombobox label="Modelo" required testId="vehiculo-modelo" value={form.model} options={models.map((model) => ({ value: model, label: model }))} onChange={(value) => onChange('model', value)} error={errors.model} onCommit={() => onCommitText('model')} searchIcon />
      <SearchCombobox label="Año" required searchIcon inputMode="numeric" maxLength={4} testId="vehiculo-anio" value={form.year} options={years.map((year) => ({ value: year, label: year }))} onChange={(value) => onChange('year', value.replace(/\D/g, '').slice(0, 4))} error={errors.year} />
      <div className="overflow-hidden rounded-b-[14px]">
        <FormRow label="Placas" htmlFor={platesId} required error={errors.plates}>
          <PlatesInput id={platesId} data-testid="vehiculo-placas" className="mac-row-input uppercase" aria-invalid={Boolean(errors.plates)} aria-required="true" aria-describedby={describedByFor(platesId, errors.plates)} onBlur={() => onBlurField('plates')} value={form.plates} maxLength={16} onValueChange={(value) => onChange('plates', value)} autoComplete="off" />
        </FormRow>
      </div>
    </Card>
    <p className="px-4 pt-2 text-xs text-mac-ink-2">El modelo se actualiza según la marca.</p>
  </div>;
}
