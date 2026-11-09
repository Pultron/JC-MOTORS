import { useId, useState } from 'react';
import { Store } from 'lucide-react';
import { Card } from '../components/newQuote/primitives/Card';
import { CardHeader } from '../components/newQuote/primitives/CardHeader';
import { FormRow } from '../components/newQuote/primitives/FormRow';
import { useToast } from '../components/ui/Toast';
import {
  loadBusinessInfo, resetBusinessInfo, saveBusinessInfo, validateBusinessInfo,
} from '../config/businessInfo';
import type { BusinessInfo, BusinessInfoErrors } from '../config/businessInfo';
import { useConfirm } from '../hooks/useConfirm';
import '../styles/respaldo.css';

interface FormState {
  nombre: string;
  telefono: string;
  direccion: string;
  correo: string;
}

const toForm = (info: BusinessInfo): FormState => ({
  nombre: info.nombre,
  telefono: info.telefonos[0] ?? '',
  direccion: info.direccion,
  correo: info.correo ?? '',
});

/** The form edits the primary phone; any additional stored phones are kept as they are. */
const toInfo = (form: FormState, base: BusinessInfo): BusinessInfo => ({
  ...base,
  nombre: form.nombre,
  telefonos: [form.telefono, ...base.telefonos.slice(1)],
  direccion: form.direccion,
  correo: form.correo,
});

export function WorkshopPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const ids = { nombre: useId(), telefono: useId(), direccion: useId(), correo: useId() };
  const [base, setBase] = useState<BusinessInfo>(loadBusinessInfo);
  const [form, setForm] = useState<FormState>(() => toForm(base));
  const [errors, setErrors] = useState<BusinessInfoErrors>({});

  const update = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  function handleSave() {
    const candidate = toInfo(form, base);
    const found = validateBusinessInfo(candidate);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error({ title: 'Revisa los datos', description: 'Corrige los campos marcados para guardar.' });
      return;
    }
    try {
      const saved = saveBusinessInfo(candidate);
      setBase(saved);
      setForm(toForm(saved));
      toast.success({ title: 'Datos del taller guardados', description: 'Las próximas cotizaciones en PDF usarán estos datos.' });
    } catch {
      toast.error({ title: 'No se pudo guardar', description: 'El almacenamiento está lleno o no está disponible. Tus datos anteriores no se modificaron.' });
    }
  }

  async function handleReset() {
    const accepted = await confirm({
      title: '¿Restablecer valores originales?',
      description: 'Los datos del taller volverán a los que traía la app. Los PDF ya generados no cambian.',
      confirmLabel: 'Restablecer',
    });
    if (!accepted) return;
    const defaults = resetBusinessInfo();
    setBase(defaults);
    setForm(toForm(defaults));
    setErrors({});
    toast.success({ title: 'Valores originales restablecidos', description: 'Se usan los datos que traía la app.' });
  }

  return <div className="respaldo-page">
    <h1 className="sr-only">Datos del taller</h1>
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-5 pb-10 pt-6 sm:px-8">
      <Card as="section">
        <CardHeader icon={<Store size={18} />} title="Datos del taller" subtitle="Aparecen en el encabezado y el pie de la cotización en PDF." />
        <FormRow label="Nombre" htmlFor={ids.nombre} required error={errors.nombre}>
          <input id={ids.nombre} data-testid="taller-nombre" className="mac-row-input" aria-invalid={Boolean(errors.nombre)} value={form.nombre} maxLength={40} onChange={(event) => update('nombre', event.target.value)} />
        </FormRow>
        <FormRow label="Teléfono" htmlFor={ids.telefono} required error={errors.telefono}>
          <input id={ids.telefono} data-testid="taller-telefono" type="tel" inputMode="tel" className="mac-row-input" aria-invalid={Boolean(errors.telefono)} value={form.telefono} maxLength={20} placeholder="(667) 123-4567" onChange={(event) => update('telefono', event.target.value.replace(/[^\d\s()+-]/g, ''))} />
        </FormRow>
        <FormRow label="Dirección" htmlFor={ids.direccion} required error={errors.direccion} tall>
          <textarea id={ids.direccion} data-testid="taller-direccion" rows={2} className="mac-row-input h-auto resize-none py-3" aria-invalid={Boolean(errors.direccion)} value={form.direccion} onChange={(event) => update('direccion', event.target.value)} placeholder={'Calle y número\nColonia, ciudad'} />
        </FormRow>
        <FormRow label="Correo" htmlFor={ids.correo} error={errors.correo}>
          <input id={ids.correo} data-testid="taller-correo" type="email" className="mac-row-input" aria-invalid={Boolean(errors.correo)} value={form.correo} onChange={(event) => update('correo', event.target.value)} placeholder="Opcional" />
        </FormRow>
        <p className="respaldo-hint">La dirección admite hasta 2 líneas. El teléfono debe tener 10 dígitos.</p>
        <div className="flex justify-end gap-3 px-4 py-3">
          <button type="button" data-testid="taller-reset" className="mac-btn mac-btn-secondary" onClick={() => void handleReset()}>Restablecer valores originales</button>
          <button type="button" data-testid="taller-save" className="mac-btn mac-btn-primary" onClick={handleSave}>Guardar</button>
        </div>
      </Card>
    </div>
  </div>;
}
