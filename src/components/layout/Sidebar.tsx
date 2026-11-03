import { ChartNoAxesColumn, FilePlus2, FileText, Gauge, History, UsersRound } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { useSidebarTheme } from '../../hooks/useSidebarTheme';
import '../../styles/sidebar.css';
import { JcLogo } from './JcLogo';

const navigation = [
  { label: 'Inicio', to: '/', icon: Gauge, end: true },
  { label: 'Nueva cotización', to: '/nueva-cotizacion', icon: FilePlus2 },
  { label: 'Historial', to: '/historial', icon: History },
  { label: 'Control interno', to: '/control-interno', icon: ChartNoAxesColumn },
  { label: 'Clientes', to: '/clientes', icon: UsersRound },
  { label: 'Facturas', to: '/facturas', icon: FileText },
];

// Alto de la opción (36px) más la separación (2px): debe coincidir con sidebar.css.
const ITEM_STEP = 38;

function activeIndex(pathname: string) {
  return navigation.findIndex(({ to, end }) => (end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)));
}

export function Sidebar() {
  const { pathname } = useLocation();
  // TODO: exponer setTheme en una pantalla de configuración (segmentado Oscuro/Claro) cuando exista.
  const { theme } = useSidebarTheme();
  const index = activeIndex(pathname);

  return (
    <aside className="sb" data-theme={theme} data-testid="sidebar">
      <div className="sb-brand">
        <JcLogo />
        <p className="sb-brand-sub">Cotizador</p>
      </div>
      <nav className="sb-nav" aria-label="Menú principal">
        <p className="sb-label" aria-hidden="true">Menú principal</p>
        <div className="sb-list">
          <span className="sb-pill" aria-hidden="true" data-hidden={index < 0} style={{ transform: `translateY(${Math.max(index, 0) * ITEM_STEP}px)` }} />
          {navigation.map(({ label, to, icon: Icon, end }, i) => (
            <NavLink key={to} to={to} end={end} className="sb-item" style={{ '--i': i } as React.CSSProperties}>
              <Icon className="sb-icon" size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </aside>
  );
}
