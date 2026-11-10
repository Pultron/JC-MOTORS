import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { MODAL_SELECTOR, detectPlatform, resolveShortcut } from '../utils/shortcuts';
import type { Platform, ShortcutAction } from '../utils/shortcuts';

type Handler = () => void;

interface ShortcutsApi {
  platform: Platform;
  register: (action: ShortcutAction, handler: Handler) => () => void;
  /** True once after Ctrl/⌘+N navigated here from another screen: the new quote screen then focuses its first field. */
  consumeNewQuoteFocus: () => boolean;
}

const fallbackPlatform = detectPlatform();
const ShortcutsContext = createContext<ShortcutsApi>({
  platform: fallbackPlatform,
  register: () => () => undefined,
  consumeNewQuoteFocus: () => false,
});

export const NEW_QUOTE_ROUTE = '/nueva-cotizacion';

/**
 * One page-level keydown listener for Ctrl/⌘+S and Ctrl/⌘+N (no Tauri global-shortcut plugin is used, so there is nothing
 * to collide with). Screens register what "save" means for them; "new" falls back to opening the new quote screen.
 */
export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const platform = fallbackPlatform;
  const handlers = useRef(new Map<ShortcutAction, Handler>());
  const focusPending = useRef(false);

  const register = useCallback((action: ShortcutAction, handler: Handler) => {
    handlers.current.set(action, handler);
    return () => {
      // A screen that mounted first must not lose its handler to the cleanup of the one it replaces.
      if (handlers.current.get(action) === handler) handlers.current.delete(action);
    };
  }, []);

  const consumeNewQuoteFocus = useCallback(() => {
    const pending = focusPending.current;
    focusPending.current = false;
    return pending;
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const { action, preventDefault } = resolveShortcut(event, { platform, modalOpen: document.querySelector(MODAL_SELECTOR) !== null });
      // Always cancelled for these combinations, so the webview never opens "Save page" or a new window.
      if (preventDefault) event.preventDefault();
      if (!action || event.repeat) return;
      const handler = handlers.current.get(action);
      if (handler) handler();
      else if (action === 'new') {
        focusPending.current = true;
        navigate(NEW_QUOTE_ROUTE);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, platform]);

  const api = useMemo(() => ({ platform, register, consumeNewQuoteFocus }), [platform, register, consumeNewQuoteFocus]);
  return <ShortcutsContext.Provider value={api}>{children}</ShortcutsContext.Provider>;
}

export function usePlatform(): Platform {
  return useContext(ShortcutsContext).platform;
}

export function useNewQuoteFocusRequest(): () => boolean {
  return useContext(ShortcutsContext).consumeNewQuoteFocus;
}

/** Runs `handler` when the shortcut is pressed while this component is mounted. The latest handler is always used. */
export function useShortcut(action: ShortcutAction, handler: Handler): void {
  const { register } = useContext(ShortcutsContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => register(action, () => latest.current()), [action, register]);
}
