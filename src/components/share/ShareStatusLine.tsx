import { Mail, MessageCircle } from 'lucide-react';
import type { Quotation } from '../../models/quotation';
import { shareAccessibleLabel, shareLineText, shareStatusOf } from '../../services/shareStatus';

type Props = {
  quotation: Pick<Quotation, 'sharedAt' | 'sharedVia'>;
  /** When given, screen readers get the whole cell as one sentence ("Name, compartida por …"); pair it with an aria-hidden name. */
  customerName?: string;
};

/** Second line under the customer: last share channel and time, or "Sin compartir". Always rendered so rows keep one height. */
export function ShareStatusLine({ quotation, customerName }: Props) {
  const status = shareStatusOf(quotation);
  const Icon = status.kind === 'shared' ? (status.medium === 'whatsapp' ? MessageCircle : Mail) : null;
  return (
    <span data-testid="share-status" data-share={status.kind === 'shared' ? status.medium : 'none'} className="share-line">
      {customerName !== undefined && <span className="sr-only">{shareAccessibleLabel(customerName, quotation)}</span>}
      <span aria-hidden={customerName !== undefined ? 'true' : undefined} className="share-line-text">
        {Icon && <Icon size={12} aria-hidden="true" className="share-line-icon" />}
        <span>{shareLineText(quotation)}</span>
      </span>
    </span>
  );
}
