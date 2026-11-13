import { useEffect, useRef } from 'react';

const CLOSE_REQUESTED_EVENT = 'jc:close-requested';

function tauriInvoke(command: string, args?: Record<string, unknown>): void {
  try {
    // Failures are intentionally silent: the guard is a convenience, never a source of error messages.
    void window.__TAURI__?.core.invoke(command, args).catch(() => undefined);
  } catch {
    // Not running under Tauri.
  }
}

/**
 * Warns before the screen is reloaded or the app window is closed while there are unsaved changes.
 * - Browser: `beforeunload`.
 * - Tauri: tells Rust the screen is dirty (`set_close_guard`); Rust cancels the window close and dispatches
 *   `jc:close-requested`, then `askToLeave` decides: true -> `close_app_window`, false -> re-arm the guard.
 */
export function useUnsavedGuard(dirty: boolean, askToLeave?: () => Promise<boolean>): void {
  const askRef = useRef(askToLeave);
  askRef.current = askToLeave;

  useEffect(() => {
    if (!dirty) return undefined;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty || !window.__TAURI__?.core) return undefined;
    let asking = false;
    async function handleCloseRequested() {
      if (asking) return;
      asking = true;
      try {
        const canLeave = askRef.current ? await askRef.current() : true;
        if (canLeave) tauriInvoke('close_app_window');
        else tauriInvoke('set_close_guard', { active: true });
      } catch {
        tauriInvoke('set_close_guard', { active: true });
      } finally {
        asking = false;
      }
    }
    tauriInvoke('set_close_guard', { active: true });
    window.addEventListener(CLOSE_REQUESTED_EVENT, handleCloseRequested);
    return () => {
      window.removeEventListener(CLOSE_REQUESTED_EVENT, handleCloseRequested);
      tauriInvoke('set_close_guard', { active: false });
    };
  }, [dirty]);
}
