import { MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Quotation } from '../models/quotation';
import { useShareQuotation } from '../store/ShareContext';
import { MacMenu } from './ui/MacMenu';
import { buildMenuItems } from './quotationMenuItems';

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
