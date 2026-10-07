import { ChevronDown } from 'lucide-react';
import type { QuotationStatus } from '../models/quotation';

const statusStyles: Record<QuotationStatus, string> = {
  Pendiente: 'bg-orange-50 text-orange-700 ring-orange-600/15',
  Aprobada: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  Cancelada: 'bg-rose-50 text-rose-700 ring-rose-600/15',
};

interface StatusBadgeProps {
  status: QuotationStatus;
  /** El chevron es decorativo: el estado no se edita en línea, se cambia desde el detalle. */
  showChevron?: boolean;
}

export function StatusBadge({ status, showChevron = false }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[status]}`}
      title={showChevron ? 'El estado se cambia desde el detalle de la cotización' : undefined}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
      {showChevron && <ChevronDown size={13} strokeWidth={2.5} aria-hidden="true" />}
    </span>
  );
}