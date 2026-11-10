import { useLayoutEffect, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  anchor: HTMLElement | null;
  open: boolean;
  /** Margen horizontal respecto al ancla (px). */
  inset?: number;
  minWidth?: number;
  maxHeight?: number;
  panelRef?: Ref<HTMLDivElement>;
  /** Extra class for variants (e.g. the compact email suggestions panel). */
  className?: string;
  /** Default true: mouse presses inside never steal focus from the anchor (listboxes). Set false for panels with their own inputs. */
  keepFocus?: boolean;
  children: ReactNode;
}

interface Position {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  placement: 'below' | 'above';
}

const GAP = 4;
const EDGE = 8;

function measure(anchor: HTMLElement, inset: number, minWidth: number, maxHeight: number): Position {
  const rect = anchor.getBoundingClientRect();
  const width = Math.max(rect.width - inset * 2, minWidth);
  const left = Math.min(Math.max(rect.left + inset, EDGE), Math.max(window.innerWidth - width - EDGE, EDGE));
  const below = window.innerHeight - rect.bottom - EDGE - GAP;
  const above = rect.top - EDGE - GAP;
  if (below < 200 && above > below) return { left, width, bottom: window.innerHeight - rect.top + GAP, maxHeight: Math.min(maxHeight, above), placement: 'above' };
  return { left, width, top: rect.bottom + GAP, maxHeight: Math.min(maxHeight, below), placement: 'below' };
}

/**
 * Panel flotante en un portal: no se recorta por overflow de las tarjetas.
 * Dentro de un <dialog> modal se monta en el propio dialog para quedar en su capa superior.
 */
export function FloatingPanel({ anchor, open, inset = 0, minWidth = 160, maxHeight = 280, panelRef, className, keepFocus = true, children }: Props) {
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) { setPosition(null); return; }
    const update = () => setPosition(measure(anchor, inset, minWidth, maxHeight));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open, anchor, inset, minWidth, maxHeight]);

  if (!open || !anchor || !position) return null;
  return createPortal(
    <div ref={panelRef} className={className ? `mac-listbox ${className}` : 'mac-listbox'} data-placement={position.placement} onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
      style={{ position: 'fixed', left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}>
      {children}
    </div>,
    anchor.closest('dialog') ?? document.body,
  );
}
