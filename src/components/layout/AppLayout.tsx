import { Outlet, useLocation } from 'react-router';
import { ToastViewport } from '../ui/Toast';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const location = useLocation();
  // Inicio y Nueva cotización usan todo el ancho y manejan su propio espaciado.
  const isFullBleed = location.pathname === '/nueva-cotizacion' || location.pathname === '/' || location.pathname === '/facturas' || location.pathname === '/clientes' || location.pathname === '/historial';
  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <Sidebar />

      <div className="min-w-0 flex-1 lg:ml-[264px]">
        <ToastViewport />
        <main className={isFullBleed ? 'new-quotation-main min-h-screen w-full' : 'mx-auto w-full max-w-[1440px] p-5 sm:p-8 xl:px-10'}><Outlet /></main>
      </div>
    </div>
  );
}
