import { Ban, Check, Copy, Download, Eye, FileText, LockKeyhole, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Quotation } from '../models/quotation';
import { MacMenu } from './ui/MacMenu';
import type { MacMenuItem } from './ui/MacMenu';

interface QuotationActionsMenuProps {
  quotation: Quotation;
  onOpenPdf: (quotation: Quotation) => void;
  onDownloadPdf?: (quotation: Quotation) => void;
  onApprove?: (quotation: Quotation) => void;
  onCancel?: (quotation: Quotation) => void;
  onDuplicate?: (quotation: Quotation) => void;
  onDelete?: (quotation: Quotation) => void;
  /** Claves de ítems que otra parte de la pantalla ya ofrece (p. ej. 'view', 'download', 'duplicate'). */
  omit?: string[];
  triggerClassName?: string;
}

export function QuotationActionsMenu(props: QuotationActionsMenuProps) {
  const navigate = useNavigate();
  const { quotation } = props;

  return (
    <MacMenu
      items={buildMenuItems({ ...props, navigate })}
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
}

function buildMenuItems({ quotation, navigate, onOpenPdf, onDownloadPdf, onApprove, onCancel, onDuplicate, onDelete, omit }: MenuItemsInput): MacMenuItem[] {
  const items: MacMenuItem[] = [
    { key: 'view', label: 'Ver detalle', icon: Eye, onSelect: () => navigate(`/cotizaciones/${quotation.id}`) },
    { key: 'pdf', label: 'Ver cotización', icon: FileText, onSelect: () => onOpenPdf(quotation) },
  ];

  if (onDownloadPdf) items.push({ key: 'download', label: 'Descargar PDF', icon: Download, onSelect: () => onDownloadPdf(quotation) });

  if (quotation.status === 'Pendiente') {
    items.push({ key: 'edit', label: 'Editar cotización', icon: Pencil, onSelect: () => navigate(`/nueva-cotizacion?editar=${quotation.id}`) });
  }

  if (quotation.status === 'Aprobada') {
    items.push({ key: 'internal', label: 'Ir a Control interno', icon: LockKeyhole, onSelect: () => navigate(`/control-interno/${quotation.id}`) });
  }

  if (onDuplicate) items.push({ key: 'duplicate', label: 'Duplicar', icon: Copy, onSelect: () => onDuplicate(quotation) });

  // Las acciones que cambian el estado van al final, separadas de las de consulta.
  if (quotation.status === 'Pendiente') {
    if (onApprove) items.push({ key: 'approve', label: 'Aprobar cotización', icon: Check, separatorBefore: true, onSelect: () => onApprove(quotation) });
    if (onCancel) items.push({ key: 'cancel', label: 'Cancelar cotización', icon: Ban, tone: 'danger', separatorBefore: !onApprove, onSelect: () => onCancel(quotation) });
  }

  if (quotation.status === 'Cancelada' && onDelete) {
    items.push({ key: 'delete', label: 'Eliminar permanentemente', icon: Trash2, tone: 'danger', separatorBefore: true, onSelect: () => onDelete(quotation) });
  }

  return omit ? items.filter((item) => !omit.includes(item.key)) : items;
}
