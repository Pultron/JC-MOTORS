import { useId } from 'react';
import { Car } from 'lucide-react';
import type { QuoteFormData } from '../../models/quoteDraft';
import { getVehicleModels, vehicleBrands } from '../../services/vehicleCatalog';
import { Select } from '../ui/Select';
import { Card } from './primitives/Card';
import { CardHeader } from './primitives/CardHeader';
import { FormRow } from './primitives/FormRow';
import { SearchCombobox } from './SearchCombobox';

interface Props {
  form: QuoteFormData;
  errors: Record<string, string>;
  onChange: <K extends keyof QuoteFormData>(key: K, value: QuoteFormData[K]) => void;
}

const FIRST_YEAR = 1995;

export function VehiculoCard({ form, errors, onChange }: Props) {
  const yearId = useId();
  const platesId = useId();
  const models = getVehicleModels(form.make);
  const lastYear = new Date().getFullYear() + 1;
  const years = Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, index) => String(lastYear - index));
  // Cotizaciones antiguas pueden traer un año fuera del rango del catálogo.
  if (form.year && !years.includes(form.year)) years.push(form.year);
  const selectMake = (value: string) => { onChange('make', value); onChange('model', ''); };

  return <div className="min-w-0 flex-[1_1_280px]">
    <Card allowOverflow>
      <CardHeader icon={<Car size={18} />} title="Datos del vehículo" />
      <SearchCombobox label="Marca" required testId="vehiculo-marca" value={form.make} options={vehicleBrands.map((brand) => ({ value: brand, label: brand }))} onChange={selectMake} onSelect={selectMake} error={errors.make} placeholder="Busca o escribe" />
      <SearchCombobox label="Modelo" required testId="vehiculo-modelo" value={form.model} options={models.map((model) => ({ value: model, label: model }))} onChange={(value) => onChange('model', value)} error={errors.model} placeholder="Busca o escribe" />
      <FormRow label="Año" htmlFor={yearId} error={errors.year}>
        <Select id={yearId} testId="vehiculo-anio" variant="row" invalid={Boolean(errors.year)} value={form.year} onChange={(value) => onChange('year', value)} placeholder="Seleccionar año" options={years.map((year) => ({ value: year, label: year }))} />
      </FormRow>
      <div className="overflow-hidden rounded-b-[14px]">
        <FormRow label="Placas" htmlFor={platesId}>
          <input id={platesId} data-testid="vehiculo-placas" className="mac-row-input uppercase" value={form.plates} maxLength={16} onChange={(event) => onChange('plates', event.target.value.toLocaleUpperCase('es-MX'))} placeholder="ABC-123-A" />
        </FormRow>
      </div>
    </Card>
    <p className="px-4 pt-2 text-xs text-mac-ink-2">El modelo se actualiza según la marca.</p>
  </div>;
}
