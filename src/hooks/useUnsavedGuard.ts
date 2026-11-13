import { useEffect } from 'react';

/**
 * Warns before the page is reloaded or closed while there are unsaved changes (browser / dev reload).
 * This is the single place that knows "the screen is dirty"; a native window-close guard can hook in here later.
 */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return undefined;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);
}
