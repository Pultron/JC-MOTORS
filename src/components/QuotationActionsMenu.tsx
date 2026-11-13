import { Ban, Check, Download, FileText, LockKeyhole, Mail, MessageCircle, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Quotation, ShareMedium } from '../models/quotation';
import { useShareQuotation } from '../store/ShareContext';
import { MacMenu } from './ui/MacMenu';
import type { MacMenuItem } from './ui/MacMenu';

interface QuotationActionsMenuProps {
  quotation: Quotation;
  onOpenPdf: (quotation: Quotation) => void;
  onDownloadPdf?: (quotation: Quotation) => void;
  onApprove?: (quotation: Quotation) => void;
  onCancel?: (quotation: Quotation) => void;
  onDelete?: (quotation: Quotation) => void;
  triggerClassName?: string;
}

export function QuotationActionsMenu(props: QuotationActionsMenuProps) {
  const navigate = useNavigate();
  const { quotation } = props;
  const { shareQuotation, canUse } = useShareQuotation();

  return (
    <MacMenu
      items={buildMenuItems({ ...props, navigate, share: (medium) => shareQuotation(quotation, medium), canShare: (medium) => canUse(quotation, medium) })}
      triggerLabel={`Más acciones para ${quotation.folio}`}
      menuLabel={`Acciones para ${quotation.folio}`}
      triggerIcon={<MoreVertical size={17} aria-hidden="true" />}
      triggerClassName={props.triggerClassName}
      triggerTestId={`acciones-${quotation.folio}`}
    />
  );
}

interface MenuItemsInput extends QuotationActionsMenuProps {
  navigate: ReturnType<typeof useNavigate>;
  share: (medium: ShareMedium) => void;
  canShare: (medium: ShareMedium) => boolean;
}

function buildMenuItems({ quotation, navigate, onOpenPdf, onDownloadPdf, onApprove, onCancel, onDelete, share, canShare }: MenuItemsInput): MacMenuItem[] {
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

  if (quotation.status === 'Cancelada' && onDelete) {
    items.push({ key: 'delete', label: 'Eliminar permanentemente', icon: Trash2, tone: 'danger', separatorBefore: true, onSelect: () => onDelete(quotation) });
  }

  return items;
}
