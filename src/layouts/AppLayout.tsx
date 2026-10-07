import { ChartNoAxesColumnIncreasing, FilePlus2, Gauge, History, Settings, UsersRound } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useEffect } from 'react';
import { useQuotations } from '../store/QuotationContext';

const navigation = [
  { label: 'Inicio', to: '/', icon: Gauge, end: true },
  { label: 'Nueva cotización', to: '/nueva-cotizacion', icon: FilePlus2 },
  { label: 'Historial', to: '/historial', icon: History },
  { label: 'Control interno', to: '/control-interno', icon: ChartNoAxesColumnIncreasing },
  { label: 'Clientes', to: '/clientes', icon: UsersRound },
  { label: 'Configuración', to: '/configuracion', icon: Settings },
];

export function AppLayout() {
  const location = useLocation();
  const isNewQuotation = location.pathname === '/nueva-cotizacion';
  const { notice, clearNotice } = useQuotations();
  const pageTitle = location.pathname === '/'
    ? 'Gestión de cotizaciones'
    : navigation.find((item) => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))?.label ?? 'Detalle de cotización';

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clearNotice, 4200);
    return () => window.clearTimeout(timer);
  }, [notice, clearNotice]);

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="flex w-full shrink-0 flex-col bg-navy-950 text-white lg:fixed lg:inset-y-0 lg:w-[258px]">
        <div className="flex h-[124px] flex-col items-center justify-center gap-1 border-b border-white/10 px-5">
          <img src="/jc-motors-logo.png" alt="JC Motors" className="size-[82px] shrink-0 rounded-full object-contain" />
          <p className="font-serif text-base font-semibold italic tracking-[0.12em] text-slate-200">Cotizador</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:gap-1.5 lg:p-4">
          <p className="hidden px-3 pb-2 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 lg:block">Menú principal</p>
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
              {({ isActive }) => <><Icon size={18} className={isActive ? 'text-white' : ''} /><span>{label}</span></>}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 p-5 lg:block"><p className="text-xs font-semibold text-slate-300">JC Motors</p><p className="mt-1 text-[11px] text-slate-500">Gestión de cotizaciones</p></div>
      </aside>

      <div className="min-w-0 flex-1 lg:ml-[258px]">
        <header className="sticky top-0 z-10 flex h-[70px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur sm:px-8">
          <p className="text-sm font-semibold text-slate-600">{pageTitle}</p>
          <div className="flex items-center gap-3"><span className="hidden text-xs text-slate-500 sm:block">Taller automotriz</span><span className="flex size-9 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-800">JC</span></div>
        </header>
        <main className={`mx-auto w-full max-w-[1440px] p-5 sm:p-8 xl:px-10 ${isNewQuotation ? 'new-quotation-main' : ''}`}><Outlet /></main>
      </div>

      {notice && <div role="status" className="fixed bottom-5 right-5 z-30 flex max-w-sm items-start gap-3 rounded-xl bg-navy-950 px-4 py-3.5 text-sm text-white shadow-xl"><span className="mt-0.5 size-2 shrink-0 rounded-full bg-emerald-400" />{notice}<button onClick={clearNotice} className="ml-2 text-slate-400 hover:text-white" aria-label="Cerrar notificación">×</button></div>}
    </div>
  );
}
