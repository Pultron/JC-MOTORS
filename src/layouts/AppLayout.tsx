import { ChartNoAxesColumnIncreasing, FilePlus2, Gauge, History, UsersRound } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useEffect } from 'react';
import { useQuotations } from '../store/QuotationContext';

const navigation = [
  { label: 'Inicio', to: '/', icon: Gauge, end: true },
  { label: 'Nueva cotización', to: '/nueva-cotizacion', icon: FilePlus2 },
  { label: 'Historial', to: '/historial', icon: History },
  { label: 'Control interno', to: '/control-interno', icon: ChartNoAxesColumnIncreasing },
  { label: 'Clientes', to: '/clientes', icon: UsersRound },
];

export function AppLayout() {
  const location = useLocation();
  const isNewQuotation = location.pathname === '/nueva-cotizacion';
  const isHistory = location.pathname === '/historial';
  const { notice, clearNotice } = useQuotations();


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
          <p className="hidden px-3 pb-2 pt-4 text-xs font-extrabold uppercase tracking-[0.14em] text-white lg:block">Menú principal</p>
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-[#234361] text-white shadow-sm before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-orange-500' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
              {({ isActive }) => <><Icon size={18} className={isActive ? 'text-orange-500' : ''} /><span>{label}</span></>}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 p-5 lg:block"><p className="text-xs font-semibold text-slate-300">JC Motors</p><p className="mt-1 text-[11px] text-slate-500">Gestión de cotizaciones</p></div>
      </aside>

      <div className="min-w-0 flex-1 lg:ml-[258px]">
        <main className={`mx-auto w-full p-5 sm:p-8 ${isHistory ? 'max-w-[1600px] xl:px-6' : 'max-w-[1440px] xl:px-10'} ${isNewQuotation ? 'new-quotation-main' : ''}`}><Outlet /></main>
      </div>

      {notice && <div role="status" className="fixed bottom-5 right-5 z-30 flex max-w-sm items-start gap-3 rounded-xl bg-navy-950 px-4 py-3.5 text-sm text-white shadow-xl"><span className="mt-0.5 size-2 shrink-0 rounded-full bg-emerald-400" />{notice}<button onClick={clearNotice} className="ml-2 text-slate-400 hover:text-white" aria-label="Cerrar notificación">×</button></div>}
    </div>
  );
}
