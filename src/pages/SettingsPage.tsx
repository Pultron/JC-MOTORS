import { Building2, MapPin, Phone } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { SectionCard } from '../components/SectionCard';

const businessSample = [
  { label: 'Nombre comercial', value: 'JC Motors', icon: Building2 },
  { label: 'Teléfono', value: '55 5555 0101', icon: Phone },
  { label: 'Dirección', value: 'Dirección del taller por configurar', icon: MapPin },
];

export function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Preferencias" title="Configuración" description="Datos de referencia del negocio para el prototipo." />
      <div className="max-w-3xl">
        <SectionCard title="Datos del negocio" description="Esta información todavía no se guarda ni se utiliza en las cotizaciones." icon={<Building2 size={19} />}>
          <div className="space-y-3">{businessSample.map(({ label, value, icon: Icon }) => <div key={label} className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm"><Icon size={18} /></span><div><p className="text-xs font-semibold text-slate-400">{label}</p><p className="mt-1 text-sm font-medium text-slate-700">{value}</p></div></div>)}</div>
          <p className="mt-5 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">Pantalla de muestra. La edición y persistencia de los datos del negocio quedan fuera de esta versión.</p>
        </SectionCard>
      </div>
    </>
  );
}
