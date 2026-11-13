import { createContext, useContext } from 'react';

export interface PaletteApi { open: () => void }

/** Lives in its own module so Vite HMR of the palette component never re-creates the context the sidebar consumes. */
export const PaletteContext = createContext<PaletteApi>({ open: () => undefined });
export const useCommandPalette = () => useContext(PaletteContext);
