import type { QuotationStatus } from '../models/quotation';

const statusStyles: Record<QuotationStatus, string> = {
  Pendiente: 'bg-orange-50 text-orange-700 ring-orange-600/15',
  Aprobada: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  Cancelada: 'bg-rose-50 text-rose-700 ring-rose-600/15',
};

interface StatusBadgeProps {
  status: QuotationStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}