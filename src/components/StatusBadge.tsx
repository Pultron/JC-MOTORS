import type { QuotationStatus } from '../models/quotation';

const statusStyles: Record<QuotationStatus, string> = {
  Pendiente: 'bg-[#fff1e8] text-[#b84209] ring-[#cc4a0b]/15',
  Aprobada: 'bg-[#e6f5ea] text-[#1b6b38] ring-[#1b6b38]/15',
  Cancelada: 'bg-rose-50 text-rose-700 ring-rose-600/15',
  Vencida: 'bg-slate-100 text-slate-600 ring-slate-500/15',
};

interface StatusBadgeProps {
  status: QuotationStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const sizeClass = size === 'sm' ? 'gap-1 px-2 py-0.5 text-[11px] font-medium' : 'gap-1.5 px-2.5 py-1 text-xs font-semibold';
  return (
    <span className={`inline-flex items-center rounded-full transition-colors duration-300 ring-1 ring-inset ${sizeClass} ${statusStyles[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
