import { useCallback, useState } from 'react';
import { readRaw, writeRaw } from '../storage/safeStorage';
import { STORAGE_KEYS } from '../storage/storageKeys';

export type SidebarTheme = 'dark' | 'light';

function readTheme(): SidebarTheme {
  return readRaw(STORAGE_KEYS.sidebarTheme) === 'light' ? 'light' : 'dark';
}

export function useSidebarTheme() {
  const [theme, setThemeState] = useState<SidebarTheme>(readTheme);

  const setTheme = useCallback((next: SidebarTheme) => {
    setThemeState(next);
    try {
      writeRaw(STORAGE_KEYS.sidebarTheme, next);
    } catch {
      // Sin almacenamiento disponible: el tema solo vale para esta sesión.
    }
  }, []);

  return { theme, setTheme };
}
