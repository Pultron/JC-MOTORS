import { Ban, Check, Download, FileText, LockKeyhole, Mail, MessageCircle, Pencil, Trash2 } from 'lucide-react';
import type { NavigateFunction } from 'react-router';
import { isDeletableStatus } from '../models/quotation';
import type { Quotation, ShareMedium } from '../models/quotation';
import type { MacMenuItem } from './ui/MacMenu';

export interface MenuItemsInput {
  quotation: Quotation;
  navigate: NavigateFunction;
  onOpenPdf: (quotation: Quotation) => void;
  onDownloadPdf?: (quotation: Quotation) => void;
  onApprove?: (quotation: Quotation) => void;
  onCancel?: (quotation: Quotation) => void;
  onDelete?: (quotation: Quotation) => void;
  share: (medium: ShareMedium) => void;
  canShare: (medium: ShareMedium) => boolean;
}

export function buildMenuItems({ quotation, navigate, onOpenPdf, onDownloadPdf, onApprove, onCancel, onDelete, share, canShare }: MenuItemsInput): MacMenuItem[] {
  const items: MacMenuItem[] = [
    { key: 'pdf', label: 'Ver cotización', icon: FileText, onSelect: () => onOpenPdf(quotation) },
  ];

  if (onDownloadPdf) items.push({ key: 'download', label: 'Descargar PDF', icon: Download, onSelect: () => onDownloadPdf(quotation) });

  if (quotation.status !== 'Cancelada') {
    // Without that contact medium the item looks inactive but still opens the "add it" dialog.
    items.push(
      { key: 'whatsapp', label: 'Enviar por WhatsApp', icon: MessageCircle, muted: !canShare('whatsapp'), hint: canShare('whatsapp') ? undefined : 'Sin teléfono registrado: te lo pediremos.', onSelect: () => share('whatsapp') },
      { key: 'email', label: 'Enviar por correo', icon: Mail, muted: !canShare('email'), hint: canShare('email') ? undefined : 'Sin correo registrado: te lo pediremos.', onSelect: () => share('email') },
    );
  }

  if (quotation.status === 'Pendiente') {
    items.push({ key: 'edit', label: 'Editar cotización', icon: Pencil, onSelect: () => navigate(`/nueva-cotizacion?editar=${quotation.id}`) });
  }

  if (quotation.status === 'Aprobada') {
    items.push({ key: 'internal', label: 'Ir a Control interno', icon: LockKeyhole, onSelect: () => navigate(`/control-interno/${quotation.id}`) });
  }

  // Las acciones que cambian el estado van al final, separadas de las de consulta.
  if (quotation.status === 'Pendiente') {
    if (onApprove) items.push({ key: 'approve', label: 'Aprobar cotización', icon: Check, separatorBefore: true, onSelect: () => onApprove(quotation) });
    if (onCancel) items.push({ key: 'cancel', label: 'Cancelar cotización', icon: Ban, tone: 'danger', separatorBefore: !onApprove, onSelect: () => onCancel(quotation) });
  }

  // Approved quotations count in Control interno and folios: they are cancelled first, never deleted directly.
  if (quotation.status === 'Aprobada' && onCancel) {
    items.push({ key: 'cancel', label: 'Cancelar cotización', icon: Ban, tone: 'danger', separatorBefore: true, onSelect: () => onCancel(quotation) });
  }

  if (isDeletableStatus(quotation.status) && onDelete) {
    items.push({ key: 'delete', label: 'Eliminar permanentemente', icon: Trash2, tone: 'danger', separatorBefore: true, onSelect: () => onDelete(quotation) });
  }

  return items;
}
