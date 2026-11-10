import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHORTCUTS, detectPlatform, resolveShortcut, shortcutFor, shortcutLabel, withShortcutHint } from '../src/utils/shortcuts.ts';

const open = { modalOpen: false };

test('platform detection: macOS uses Command, Windows and Linux use Control', () => {
  assert.equal(detectPlatform({ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }), 'mac');
  assert.equal(detectPlatform({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/120' }), 'other');
  assert.equal(detectPlatform({ platform: 'Linux x86_64' }), 'other');
  assert.equal(detectPlatform(undefined), 'other');
});

test('Windows: Ctrl+S saves, Ctrl+N is new; Command does not count', () => {
  assert.equal(resolveShortcut({ key: 's', ctrlKey: true }, { platform: 'other', ...open }).action, 'save');
  assert.equal(resolveShortcut({ key: 'n', ctrlKey: true }, { platform: 'other', ...open }).action, 'new');
  assert.equal(resolveShortcut({ key: 'S', ctrlKey: true }, { platform: 'other', ...open }).action, 'save', 'Caps Lock');
  assert.deepEqual(resolveShortcut({ key: 's', metaKey: true }, { platform: 'other', ...open }), { action: null, preventDefault: false });
});

test('macOS: Command+S / Command+N; Control alone does not count', () => {
  assert.equal(resolveShortcut({ key: 's', metaKey: true }, { platform: 'mac', ...open }).action, 'save');
  assert.equal(resolveShortcut({ key: 'n', metaKey: true }, { platform: 'mac', ...open }).action, 'new');
  assert.equal(resolveShortcut({ key: 's', ctrlKey: true }, { platform: 'mac', ...open }).action, null);
});

test('other combinations are not shortcuts (Shift, Alt/AltGr, both modifiers, other keys)', () => {
  const ctx = { platform: 'other', ...open };
  assert.equal(shortcutFor({ key: 's', ctrlKey: true, shiftKey: true }, 'other'), null);
  assert.equal(shortcutFor({ key: 's', ctrlKey: true, altKey: true }, 'other'), null);
  assert.equal(shortcutFor({ key: 's', ctrlKey: true, metaKey: true }, 'other'), null);
  assert.deepEqual(resolveShortcut({ key: 'a', ctrlKey: true }, ctx), { action: null, preventDefault: false });
  assert.deepEqual(resolveShortcut({ key: 's' }, ctx), { action: null, preventDefault: false });
});

test('with a modal open the action is blocked but the webview default is still cancelled', () => {
  assert.deepEqual(resolveShortcut({ key: 's', ctrlKey: true }, { platform: 'other', modalOpen: true }), { action: null, preventDefault: true });
  assert.deepEqual(resolveShortcut({ key: 'n', metaKey: true }, { platform: 'mac', modalOpen: true }), { action: null, preventDefault: true });
});

test('during IME composition nothing happens at all', () => {
  assert.deepEqual(resolveShortcut({ key: 's', ctrlKey: true, isComposing: true }, { platform: 'other', ...open }), { action: null, preventDefault: false });
  assert.deepEqual(resolveShortcut({ key: 'Process', ctrlKey: true, keyCode: 229 }, { platform: 'other', ...open }), { action: null, preventDefault: false });
  assert.deepEqual(resolveShortcut({ key: 's', ctrlKey: true, keyCode: 229 }, { platform: 'other', ...open }), { action: null, preventDefault: false });
});

test('labels follow the platform', () => {
  assert.equal(shortcutLabel('save', 'mac'), '⌘S');
  assert.equal(shortcutLabel('save', 'other'), 'Ctrl+S');
  assert.equal(shortcutLabel('new', 'mac'), '⌘N');
  assert.equal(withShortcutHint('Guardar cotización', 'save', 'other'), 'Guardar cotización (Ctrl+S)');
  assert.deepEqual(SHORTCUTS.map((shortcut) => shortcut.action), ['save', 'new']);
});
