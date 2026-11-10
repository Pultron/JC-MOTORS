import { ChartNoAxesColumn, DatabaseBackup, FilePlus2, FileText, Gauge, History, Keyboard, Store, UsersRound } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { usePlatform } from '../../hooks/useShortcuts';
import { useSidebarTheme } from '../../hooks/useSidebarTheme';
import { shortcutLabel } from '../../utils/shortcuts';
import type { ShortcutAction } from '../../utils/shortcuts';
import '../../styles/sidebar.css';
import { JcLogo } from './JcLogo';

const navigation: ReadonlyArray<{ label: string; to: string; icon: typeof Gauge; end?: boolean; shortcut?: ShortcutAction }> = [
  { label: 'Inicio', to: '/', icon: Gauge, end: true },
  { label: 'Nueva cotización', to: '/nueva-cotizacion', icon: FilePlus2, shortcut: 'new' },
  { label: 'Historial', to: '/historial', icon: History },
  { label: 'Control interno', to: '/control-interno', icon: ChartNoAxesColumn },
  { label: 'Clientes', to: '/clientes', icon: UsersRound },
  { label: 'Facturas', to: '/facturas', icon: FileText },
  { label: 'Datos del taller', to: '/datos-del-taller', icon: Store },
  { label: 'Respaldo', to: '/respaldo', icon: DatabaseBackup },
  { label: 'Atajos de teclado', to: '/atajos', icon: Keyboard },
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
  const platform = usePlatform();

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
          {navigation.map(({ label, to, icon: Icon, end, shortcut }, i) => (
            <NavLink key={to} to={to} end={end} className="sb-item" style={{ '--i': i } as React.CSSProperties} title={shortcut ? `${label} (${shortcutLabel(shortcut, platform)})` : undefined} aria-keyshortcuts={shortcut ? (platform === 'mac' ? 'Meta+N' : 'Control+N') : undefined}>
              <Icon className="sb-icon" size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
              {shortcut && <kbd className="sb-kbd" aria-hidden="true">{shortcutLabel(shortcut, platform)}</kbd>}
            </NavLink>
          ))}
        </div>
      </nav>
    </aside>
  );
}
