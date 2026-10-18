import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Check, Copy, Download, Eye, LockKeyhole, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import type { Quotation } from '../models/quotation';

const MENU_WIDTH = 232;
const MENU_ITEM_HEIGHT = 36;
const VIEWPORT_GAP = 8;

interface QuotationActionsMenuProps {
  quotation: Quotation;
  onOpenPdf: (quotation: Quotation) => void;
  onApprove?: (quotation: Quotation) => void;
  onCancel?: (quotation: Quotation) => void;
  onDuplicate?: (quotation: Quotation) => void;
}

interface MenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  tone?: 'danger';
  onSelect: () => void;
}

/**
 * Se renderiza en un portal porque la celda vive dentro de un contenedor con
 * overflow: cualquier menú absoluto quedaría recortado por la tabla.
 */
export function QuotationActionsMenu({ quotation, onOpenPdf, onApprove, onCancel, onDuplicate }: QuotationActionsMenuProps) {
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const isOpen = position !== null;

  useEffect(() => {
    if (!isOpen) return;

    function close() {
      setPosition(null);
      buttonRef.current?.focus();
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setPosition(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [isOpen]);

  const items = buildMenuItems({ quotation, navigate, onOpenPdf, onApprove, onCancel, onDuplicate });

  function handleToggle() {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = items.length * MENU_ITEM_HEIGHT + 8;
    const left = Math.min(Math.max(VIEWPORT_GAP, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - VIEWPORT_GAP);
    const fitsBelow = rect.bottom + menuHeight + VIEWPORT_GAP <= window.innerHeight;
    const top = fitsBelow ? rect.bottom + 6 : Math.max(VIEWPORT_GAP, rect.top - menuHeight - 6);
    setPosition({ top, left });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-label={`Más acciones para ${quotation.folio}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleToggle}
      >
        <MoreVertical size={17} />
      </button>

      {position && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Acciones para ${quotation.folio}`}
          style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          className="fixed z-50 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-navy-950/10"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`flex w-full items-center gap-2.5 px-3.5 text-left text-sm font-medium transition ${item.tone === 'danger' ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50 hover:text-navy-950'}`}
              onClick={() => {
                setPosition(null);
                item.onSelect();
              }}
            >
              <item.icon size={16} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

interface MenuItemsInput {
  quotation: Quotation;
  navigate: ReturnType<typeof useNavigate>;
  onOpenPdf: (quotation: Quotation) => void;
  onApprove?: (quotation: Quotation) => void;
  onCancel?: (quotation: Quotation) => void;
  onDuplicate?: (quotation: Quotation) => void;
}

function buildMenuItems({ quotation, navigate, onOpenPdf, onApprove, onCancel, onDuplicate }: MenuItemsInput): MenuItem[] {
  const items: MenuItem[] = [
    { key: 'view', label: 'Ver detalle', icon: Eye, onSelect: () => navigate(`/cotizaciones/${quotation.id}`) },
    { key: 'pdf', label: 'Descargar PDF', icon: Download, onSelect: () => onOpenPdf(quotation) },
  ];

  if (quotation.status === 'Pendiente') {
    if (onApprove) items.push({ key: 'approve', label: 'Aprobar cotización', icon: Check, onSelect: () => onApprove(quotation) });
    if (onCancel) items.push({ key: 'cancel', label: 'Cancelar cotización', icon: Ban, tone: 'danger', onSelect: () => onCancel(quotation) });
  }

  if (quotation.status === 'Aprobada') {
    items.push({ key: 'internal', label: 'Ir a Control interno', icon: LockKeyhole, onSelect: () => navigate(`/control-interno/${quotation.id}`) });
  }

  if (onDuplicate) items.push({ key: 'duplicate', label: 'Duplicar', icon: Copy, onSelect: () => onDuplicate(quotation) });

  return items;
}