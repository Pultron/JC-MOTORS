import { Check } from 'lucide-react';
import type { Quotation } from '../../models/quotation';
import { sharedLabel } from '../../services/shareQuotation';

/** Subtle "already sent" record. Icon only (with tooltip) in tables; with text on the detail page. */
export function SharedMark({ quotation, showText = false }: { quotation: Pick<Quotation, 'sharedAt' | 'sharedVia'>; showText?: boolean }) {
  const label = sharedLabel(quotation);
  if (!label) return null;
  if (showText) return <span data-testid="shared-record" className="inline-flex items-center gap-1 text-[13px] text-slate-500"><Check size={14} aria-hidden="true" />{label}</span>;
  return <span data-testid="shared-mark" title={label} role="img" aria-label={label} className="ml-1.5 inline-flex align-middle text-slate-400"><Check size={13} aria-hidden="true" /></span>;
}
