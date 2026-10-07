import { Eye, FileText } from 'lucide-react';
import { Link } from 'react-router';
import type { Quotation } from '../models/quotation';
import { calculateQuotationTotals, formatCurrency, formatDate } from '../utils/quotation';
import { QuotationActionsMenu } from './QuotationActionsMenu';
import { StatusBadge } from './StatusBadge';

interface QuotationTableProps {
  quotations: Quotation[];
  onOpenPdf: (quotation: Quotation) => void;
  onApprove?: (quotation: Quotation) => void;
  onCancel?: (quotation: Quotation) => void;
  onDuplicate?: (quotation: Quotation) => void;
}

export function QuotationTable({ quotations, onOpenPdf, onApprove, onCancel, onDuplicate }: QuotationTableProps) {
  if (quotations.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500">No hay cotizaciones que coincidan con la búsqueda.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <th className="pb-3 pl-2 pr-4">Folio</th>
            <th className="px-4 pb-3">Fecha</th>
            <th className="px-4 pb-3">Cliente</th>
            <th className="px-4 pb-3">Vehículo</th>
            <th className="px-4 pb-3">Estado</th>
            <th className="px-4 pb-3 text-right">Total</th>
            <th className="px-4 pb-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {quotations.map((quotation) => {
            const totals = calculateQuotationTotals(quotation.items, quotation.laborDiscountType, quotation.laborDiscountValue, quotation.includeVat);
            return <tr key={quotation.id} className="transition-colors hover:bg-slate-50/70">
              <td className="py-3 pl-2 pr-4 font-bold text-navy-900">{quotation.folio}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(quotation.createdAt)}</td>
              <td className="px-4 py-3 font-medium text-slate-800">{quotation.customer.name}</td>
              <td className="px-4 py-3 text-slate-500">{quotation.vehicle.make} {quotation.vehicle.model}</td>
              <td className="px-4 py-3"><StatusBadge status={quotation.status} showChevron /></td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-800">{formatCurrency(totals.total)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-0.5">
                  <Link className="icon-button" aria-label={`Ver detalle de ${quotation.folio}`} title="Ver detalle" to={`/cotizaciones/${quotation.id}`}><Eye size={17} /></Link>
                  <button type="button" className="icon-button" aria-label={`Ver PDF de ${quotation.folio}`} title="Vista previa del PDF" onClick={() => onOpenPdf(quotation)}><FileText size={17} /></button>
                  <QuotationActionsMenu quotation={quotation} onOpenPdf={onOpenPdf} onApprove={onApprove} onCancel={onCancel} onDuplicate={onDuplicate} />
                </div>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}