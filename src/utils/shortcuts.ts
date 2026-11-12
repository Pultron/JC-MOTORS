/**
 * Pure keyboard-shortcut logic (no DOM): which key press means which app action, and how it is labelled.
 * The window listener lives in hooks/useShortcuts.tsx; everything decidable without a browser is decided here.
 */

export type Platform = 'mac' | 'other';
export type ShortcutAction = 'save' | 'new' | 'search';

export interface ShortcutKeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  /** KeyboardEvent.isComposing: an IME is building text. */
  isComposing?: boolean;
  /** Legacy marker (229) that some webviews send while composing. */
  keyCode?: number;
}

export interface ShortcutContext {
  platform: Platform;
  /** A modal dialog is open: the page behind it must not react. */
  modalOpen: boolean;
}

export interface ShortcutResolution {
  action: ShortcutAction | null;
  /** The webview default (Save page, New window) must be cancelled even when the action itself is blocked. */
  preventDefault: boolean;
}

export interface ShortcutInfo {
  action: ShortcutAction;
  /** Lowercase key paired with the platform modifier. */
  key: string;
  label: string;
  description: string;
}

export const SHORTCUTS: readonly ShortcutInfo[] = [
  { action: 'save', key: 's', label: 'Guardar', description: 'Guarda la cotización en Nueva cotización, o el cliente que estás editando en Clientes.' },
  { action: 'new', key: 'n', label: 'Nueva cotización', description: 'Abre una cotización nueva y deja el cursor en el primer campo. Lo que tenías sin guardar se conserva como borrador.' },
  { action: 'search', key: 'k', label: 'Buscar', description: 'Abre la búsqueda global: cotizaciones, clientes y facturas desde cualquier pantalla. Flechas para recorrer, Enter para abrir, Esc para cerrar.' },
];

/** macOS (and iPadOS desktop mode) use Command; everything else uses Control. */
export function detectPlatform(nav: { platform?: string; userAgent?: string } | undefined = typeof navigator === 'undefined' ? undefined : navigator): Platform {
  const source = `${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`;
  return /mac|iphone|ipad|ipod/i.test(source) ? 'mac' : 'other';
}

/** Which shortcut a key press is, ignoring whether it may run right now. */
export function shortcutFor(input: ShortcutKeyInput, platform: Platform): ShortcutInfo | null {
  const modifier = platform === 'mac' ? Boolean(input.metaKey) && !input.ctrlKey : Boolean(input.ctrlKey) && !input.metaKey;
  if (!modifier || input.altKey || input.shiftKey) return null;
  const key = input.key.toLowerCase();
  return SHORTCUTS.find((shortcut) => shortcut.key === key) ?? null;
}

/**
 * Decides what a key press does. While an IME composes, nothing happens (not even preventDefault).
 * With a modal open the action is blocked, but the webview default is still cancelled so Ctrl+S never opens "Save page".
 */
export function resolveShortcut(input: ShortcutKeyInput, context: ShortcutContext): ShortcutResolution {
  const none: ShortcutResolution = { action: null, preventDefault: false };
  if (input.isComposing || input.keyCode === 229) return none;
  const shortcut = shortcutFor(input, context.platform);
  if (!shortcut) return none;
  return { action: context.modalOpen ? null : shortcut.action, preventDefault: true };
}

export function modifierLabel(platform: Platform): string {
  return platform === 'mac' ? '⌘' : 'Ctrl';
}

/** "⌘S" on macOS, "Ctrl+S" elsewhere. */
export function shortcutLabel(action: ShortcutAction, platform: Platform): string {
  const shortcut = SHORTCUTS.find((item) => item.action === action);
  if (!shortcut) return '';
  const key = shortcut.key.toUpperCase();
  return platform === 'mac' ? `${modifierLabel(platform)}${key}` : `${modifierLabel(platform)}+${key}`;
}

/** Tooltip text: "Guardar cotización (Ctrl+S)". */
export function withShortcutHint(text: string, action: ShortcutAction, platform: Platform): string {
  return `${text} (${shortcutLabel(action, platform)})`;
}

/** CSS selector for anything that behaves as a modal dialog in this app. */
export const MODAL_SELECTOR = '[aria-modal="true"], dialog[open]';
