import { useState } from 'react';
import { Link } from 'react-router';
import { daysSinceLastBackup, shouldRemindBackup } from '../../storage/backupService';

// Se recuerda una vez por sesión: si se descarta, no vuelve hasta reabrir la app.
let dismissedThisSession = false;

export function BackupReminder() {
  const [visible, setVisible] = useState(() => !dismissedThisSession && shouldRemindBackup());
  if (!visible) return null;

  const days = daysSinceLastBackup();
  return <div role="note" data-testid="backup-reminder" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] bg-mac-info-bg px-4 py-2.5 text-[13px] text-mac-info-text">
    <span className="min-w-0 flex-1">{days === null ? 'Aún no has hecho un respaldo de tus datos.' : `Hace ${days} días que no haces un respaldo.`}</span>
    <Link to="/respaldo" className="font-semibold underline underline-offset-2">Hacer respaldo</Link>
    <button type="button" className="font-medium underline underline-offset-2" onClick={() => { dismissedThisSession = true; setVisible(false); }}>Más tarde</button>
  </div>;
}
