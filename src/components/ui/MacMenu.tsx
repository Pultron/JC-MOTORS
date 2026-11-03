import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

export interface MacMenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  tone?: 'danger';
  /** Dibuja una línea separadora antes del ítem. */
  separatorBefore?: boolean;
  onSelect: () => void;
}

interface MacMenuProps {
  items: MacMenuItem[];
  /** Nombre accesible del botón disparador. */
  triggerLabel: string;
  /** Nombre accesible del menú. */
  menuLabel: string;
  triggerIcon: ReactNode;
  triggerClassName?: string;
  triggerTestId?: string;
  width?: number;
}

const VIEWPORT_GAP = 8;
const TRIGGER_GAP = 6;

interface MenuPosition {
  top: number;
  left: number;
  placement: 'bottom' | 'top';
}

/**
 * Menú desplegable translúcido estilo macOS. Vive en un portal porque suele abrirse
 * desde celdas de tablas con overflow, que recortarían un menú absoluto.
 */
export function MacMenu({ items, triggerLabel, menuLabel, triggerIcon, triggerClassName = 'icon-button', triggerTestId, width = 232 }: MacMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  // Al abrir con teclado el foco va al primer ítem; con el mouse se queda en el menú.
  const focusFirstOnOpen = useRef(false);

  function close(restoreFocus: boolean) {
    setIsOpen(false);
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function open(withKeyboard: boolean) {
    focusFirstOnOpen.current = withKeyboard;
    setIsOpen(true);
  }

  // Se mide el menú ya montado para decidir si cabe debajo del disparador o se abre hacia arriba.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const trigger = triggerRef.current?.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    if (!trigger) return;
    const left = Math.min(Math.max(VIEWPORT_GAP, trigger.right - width), window.innerWidth - width - VIEWPORT_GAP);
    const fitsBelow = trigger.bottom + TRIGGER_GAP + menuHeight + VIEWPORT_GAP <= window.innerHeight;
    setPosition(fitsBelow
      ? { top: trigger.bottom + TRIGGER_GAP, left, placement: 'bottom' }
      : { top: Math.max(VIEWPORT_GAP, trigger.top - TRIGGER_GAP - menuHeight), left, placement: 'top' });
  }, [isOpen, width]);

  useEffect(() => {
    if (!position) return;
    if (focusFirstOnOpen.current) itemRefs.current[0]?.focus();
    else menuRef.current?.focus();
  }, [position]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    }
    function handleViewportChange() {
      // Si el foco estaba dentro del menú se devuelve al disparador para no perderlo.
      close(Boolean(menuRef.current?.contains(document.activeElement)));
    }

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen]);

  itemRefs.current.length = items.length;

  function moveFocus(step: number | 'first' | 'last') {
    const buttons = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (step === 'first') next = 0;
    else if (step === 'last') next = buttons.length - 1;
    else if (current === -1) next = step > 0 ? 0 : buttons.length - 1;
    else next = (current + step + buttons.length) % buttons.length;
    buttons[next].focus();
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); moveFocus(1); break;
      case 'ArrowUp': event.preventDefault(); moveFocus(-1); break;
      case 'Home': event.preventDefault(); moveFocus('first'); break;
      case 'End': event.preventDefault(); moveFocus('last'); break;
      case 'Escape': event.preventDefault(); event.stopPropagation(); close(true); break;
      case 'Tab': close(false); break;
      default: break;
    }
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open(true);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        data-testid={triggerTestId}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onKeyDown={handleTriggerKeyDown}
        // detail === 0 significa que el clic vino de Enter o Espacio.
        onClick={(event) => (isOpen ? close(false) : open(event.detail === 0))}
      >
        {triggerIcon}
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          aria-label={menuLabel}
          data-placement={position?.placement ?? 'bottom'}
          className="mac-menu"
          style={{ top: position?.top ?? 0, left: position?.left ?? 0, width, visibility: position ? 'visible' : 'hidden' }}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item, index) => (
            <div key={item.key} role="none">
              {item.separatorBefore && index > 0 && <div role="separator" className="mac-menu-separator" />}
              <button
                ref={(element) => { itemRefs.current[index] = element; }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-tone={item.tone}
                data-testid={`menu-${item.key}`}
                className="mac-menu-item"
                onMouseEnter={(event) => event.currentTarget.focus()}
                onClick={() => {
                  // El foco vuelve al disparador antes de la acción para que un diálogo lo restaure ahí.
                  close(true);
                  item.onSelect();
                }}
              >
                {item.icon && <item.icon size={15} aria-hidden="true" className="shrink-0" />}
                <span className="truncate">{item.label}</span>
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
