import { useCallback, useState } from 'react';

export type SidebarTheme = 'dark' | 'light';

const STORAGE_KEY = 'jc-motors-sidebar-theme';

function readTheme(): SidebarTheme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function useSidebarTheme() {
  const [theme, setThemeState] = useState<SidebarTheme>(readTheme);

  const setTheme = useCallback((next: SidebarTheme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sin almacenamiento disponible: el tema solo vale para esta sesión.
    }
  }, []);

  return { theme, setTheme };
}
