import { usePlatform } from '../hooks/useShortcuts';
import { SHORTCUTS, shortcutLabel } from '../utils/shortcuts';

const EMAIL_KEYS: ReadonlyArray<{ keys: string; description: string }> = [
  { keys: '↑ ↓', description: 'Mueven la selección entre las sugerencias de dominio.' },
  { keys: 'Tab · Enter', description: 'Aceptan la sugerencia seleccionada.' },
  { keys: 'Esc', description: 'Cierra las sugerencias sin cambiar el correo.' },
];

/** Help screen: the keyboard shortcuts of the app, with the modifier of the current platform. */
export function ShortcutsPage() {
  const platform = usePlatform();
  return <div className="jc-shortcuts" data-testid="atajos-page">
    <header>
      <h1>Atajos de teclado</h1>
      <p>Funcionan aunque el cursor esté dentro de un campo. No se activan mientras hay un diálogo abierto ni mientras escribes con un método de entrada (acentos, IME).</p>
    </header>
    <section aria-labelledby="atajos-generales">
      <h2 id="atajos-generales">General</h2>
      <ul>
        {SHORTCUTS.map((shortcut) => <li key={shortcut.action} data-testid={`atajo-${shortcut.action}`}>
          <div><strong>{shortcut.label}</strong><span>{shortcut.description}</span></div>
          <kbd className="jc-kbd">{shortcutLabel(shortcut.action, platform)}</kbd>
        </li>)}
      </ul>
    </section>
    <section aria-labelledby="atajos-correo">
      <h2 id="atajos-correo">En el campo de correo</h2>
      <ul>
        {EMAIL_KEYS.map((entry) => <li key={entry.keys}>
          <div><span>{entry.description}</span></div>
          <kbd className="jc-kbd">{entry.keys}</kbd>
        </li>)}
      </ul>
    </section>
  </div>;
}
