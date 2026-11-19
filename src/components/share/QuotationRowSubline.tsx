import type { Quotation } from '../../models/quotation';
import { cancelledLineText } from '../../services/cancellationText';
import { ShareStatusLine } from './ShareStatusLine';

/** Second line under the customer in the tables: the cancellation for cancelled quotations, the share status otherwise. */
export function QuotationRowSubline({ quotation }: { quotation: Quotation }) {
  if (quotation.status !== 'Cancelada') return <ShareStatusLine record={quotation} customerName={quotation.customer.name} />;
  const text = cancelledLineText(quotation);
  return (
    <span data-testid="cancelled-line" className="share-line cancelled-line">
      <span className="sr-only">{`${quotation.customer.name}, ${text}`}</span>
      <span aria-hidden="true" className="share-line-text" title={text}><span>{text}</span></span>
    </span>
  );
}
