import { Outlet, useMatches } from 'react-router';
import type { RouteHandle } from '../../routes/routeHandle';
import { CommandPaletteProvider } from '../../search/CommandPalette';
import { ShortcutsProvider } from '../../hooks/useShortcuts';
import { ToastViewport } from '../ui/Toast';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  // Each route declares `handle: { fullBleed: true }` in App.tsx; Inicio, Nueva cotización and friends manage their own spacing.
  const isFullBleed = useMatches().some((match) => (match.handle as RouteHandle | undefined)?.fullBleed === true);
  return (
    <ShortcutsProvider>
      <CommandPaletteProvider>
      <div className="min-h-screen bg-slate-50 lg:flex">
        <Sidebar />

        <div className="min-w-0 flex-1 lg:ml-[264px]">
          <ToastViewport />
          <main className={isFullBleed ? 'new-quotation-main min-h-screen w-full' : 'mx-auto w-full max-w-[1440px] p-5 sm:p-8 xl:px-10'}><Outlet /></main>
        </div>
      </div>
      </CommandPaletteProvider>
    </ShortcutsProvider>
  );
}
