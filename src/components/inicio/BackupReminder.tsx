import { useState } from 'react';
import { DatabaseBackup } from 'lucide-react';
import { Link } from 'react-router';
import { daysSinceLastBackup, shouldRemindBackup } from '../../storage/backupService';

// Se recuerda una vez por sesión: si se descarta, no vuelve hasta reabrir la app.
let dismissedThisSession = false;

export function BackupReminder() {
  const [visible, setVisible] = useState(() => !dismissedThisSession && shouldRemindBackup());
  if (!visible) return null;

  const days = daysSinceLastBackup();
  const title = days === null ? 'Aún no has hecho un respaldo' : `Hace ${days} días que no respaldas`;
  return <div role="note" data-testid="backup-reminder" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-mac-info-bg px-3.5 py-3 text-mac-info-text shadow-[0_0_0_1px_rgb(0_0_0/6%)]">
    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-white/70" aria-hidden="true"><DatabaseBackup size={18} /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-[14px] font-semibold leading-tight">{title}</span>
      <span className="block text-[13px] leading-snug opacity-80">Guarda una copia en una USB para no perder tus cotizaciones, clientes y facturas.</span>
    </span>
    <span className="flex flex-none items-center gap-1.5">
      <Link to="/respaldo" className="mac-press inline-flex h-8 items-center rounded-lg bg-mac-accent px-3.5 text-[13px] font-semibold text-white hover:bg-mac-accent-hover">Exportar respaldo</Link>
      <button type="button" className="mac-press inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium hover:bg-white/60" onClick={() => { dismissedThisSession = true; setVisible(false); }}>Más tarde</button>
    </span>
  </div>;
}
