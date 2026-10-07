import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Ban, CarFront, Check, Copy, FileText, Printer, ReceiptText, UserRound } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { QuotationPdfDialog } from '../components/QuotationPdfDialog';
import { SectionCard } from '../components/SectionCard';
import { StatusBadge } from '../components/StatusBadge';
import { useQuotationActions } from '../hooks/useQuotationActions';
import type { Quotation } from '../models/quotation';
import { useQuotations } from '../store/QuotationContext';
import { formatCurrency, formatDate, toPublicQuotation } from '../utils/quotation';

export function QuotationDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { getQuotation, duplicateQuotation, quotations } = useQuotations();
  const [quotation, setQuotation] = useState<Quotation | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isPdfOpen, setIsPdfOpen] = useState(false);
  const { requestApprove, requestCancel, confirmDialog } = useQuotationActions(setQuotation);
  const publicQuotation = useMemo(() => quotation ? toPublicQuotation(quotation) : undefined, [quotation]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    getQuotation(id).then((result) => {
      if (active) {
        setQuotation(result);
        setIsLoading(false);
      }
    });
    return () => { active = false; };
  }, [id, getQuotation, quotations]);

  async function handleDuplicate() {
    const duplicated = await duplicateQuotation(id);
    if (duplicated) navigate(`/cotizaciones/${duplicated.id}`);
  }

  if (isLoading) return <p className="py-16 text-center text-sm text-slate-500">Cargando cotización…</p>;
  if (!quotation || !publicQuotation) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><p className="font-semibold text-navy-950">No encontramos esa cotización.</p><Button className="mt-4" icon={<ArrowLeft size={16} />} onClick={() => navigate('/historial')}>Regresar al historial</Button></div>;

  return (
    <div className="print-area">
      <PageHeader eyebrow="Detalle de cotización" title={publicQuotation.folio} description={`Creada el ${formatDate(publicQuotation.createdAt)}`} actions={<div className="flex flex-wrap gap-2 print:hidden"><Button icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>Regresar</Button><Button icon={<Copy size={16} />} onClick={() => void handleDuplicate()}>Duplicar</Button>{quotation.status === 'Pendiente' && <><Button variant="secondary" icon={<Check size={16} />} onClick={() => requestApprove(quotation)}>Aprobar cotización</Button><Button variant="danger" icon={<Ban size={16} />} onClick={() => requestCancel(quotation)}>Cancelar</Button></>}<Button icon={<FileText size={16} />} onClick={() => setIsPdfOpen(true)}>Ver PDF</Button><Button variant="primary" icon={<Printer size={16} />} onClick={() => window.print()}>Imprimir</Button></div>} />
      <div className="mb-5 hidden items-center gap-4 border-b-2 border-orange-500 pb-4 print:flex">
        <img src="/jc-motors-logo.png" alt="" className="size-16 object-contain" />
        <div><p className="text-xl font-bold text-navy-950">{publicQuotation.businessName}</p>
          <p className="mt-1 text-sm text-slate-500">Cotización de servicio · {publicQuotation.folio}</p></div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <SectionCard title="Cliente" icon={<UserRound size={19} />}>
              <InfoLine label="Nombre" value={publicQuotation.customer.name} /><InfoLine label="Teléfono" value={publicQuotation.customer.phone || '—'} /><InfoLine label="Correo" value={publicQuotation.customer.email || '—'} />
            </SectionCard>
            <SectionCard title="Vehículo" icon={<CarFront size={20} />}>
              <InfoLine label="Marca y modelo" value={`${publicQuotation.vehicle.make} ${publicQuotation.vehicle.model}`} /><InfoLine label="Año" value={publicQuotation.vehicle.year?.toString() ?? '—'} /><InfoLine label="Placas" value={publicQuotation.vehicle.plates || '—'} />
            </SectionCard>
          </div>
          <SectionCard title="Servicios y refacciones" description="Conceptos incluidos en esta cotización." icon={<ReceiptText size={19} />}>
            <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"><th className="pb-3">Tipo</th><th className="pb-3">Descripción</th><th className="px-3 pb-3 text-right">Cantidad</th><th className="px-3 pb-3 text-right">Precio unitario</th><th className="pb-3 text-right">Importe</th></tr></thead><tbody className="divide-y divide-slate-100">{publicQuotation.items.map((item) => <tr key={item.id}><td className="py-4 text-xs text-slate-500">{item.type === 'labor' ? 'Mano de obra' : 'Refacción'}</td><td className="py-4 font-medium text-slate-700">{item.description}</td><td className="px-3 py-4 text-right text-slate-500">{item.quantity}</td><td className="px-3 py-4 text-right text-slate-500">{formatCurrency(item.saleUnitPrice)}</td><td className="py-4 text-right font-semibold text-slate-700">{formatCurrency(item.amount)}</td></tr>)}</tbody></table></div>
          </SectionCard>
            {(publicQuotation.publicNotes || publicQuotation.customerNotes || publicQuotation.validityDays > 0) && <SectionCard title="Detalles adicionales">
              <InfoLine label="Vigencia" value={`${publicQuotation.validityDays} días`} />
              {publicQuotation.customerNotes && <div className="border-t border-slate-100 pt-3"><p className="text-xs font-medium text-slate-500">Notas para el cliente</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{publicQuotation.customerNotes}</p></div>}
            {publicQuotation.publicNotes && <div className="border-t border-slate-100 pt-3"><p className="text-xs font-medium text-slate-500">Observaciones</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{publicQuotation.publicNotes}</p></div>}
          </SectionCard>}
        </div>
        <aside className="h-fit rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
          <div className="mb-5 flex items-center justify-between"><h2 className="font-bold text-navy-950">Resumen</h2><span className="print:hidden"><StatusBadge status={quotation.status} /></span></div>
          <div className="space-y-4 text-sm">
            <InfoLine label="Subtotal de refacciones" value={formatCurrency(publicQuotation.subtotalRefacciones)} />
            <InfoLine label="Subtotal de mano de obra" value={formatCurrency(publicQuotation.subtotalManoObra)} />
            {publicQuotation.laborDiscount > 0 && <InfoLine label="Descuento en mano de obra" value={`− ${formatCurrency(publicQuotation.laborDiscount)}`} />}
            <InfoLine label="Subtotal después del descuento" value={formatCurrency(publicQuotation.subtotalNeto)} />
            <InfoLine label="IVA (16%)" value={`${publicQuotation.includeVat ? '' : 'No incluido · '}${formatCurrency(publicQuotation.ivaAmount)}`} />
            <div className="border-t border-slate-100 pt-4"><div className="flex items-center justify-between"><span className="font-semibold text-slate-700">Total</span><span className="text-xl font-bold text-navy-950">{formatCurrency(publicQuotation.total)}</span></div></div>
          </div>
        </aside>
      </div>

      {isPdfOpen && <QuotationPdfDialog quotation={publicQuotation} onClose={() => setIsPdfOpen(false)} />}

      {confirmDialog}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0 last:pb-0"><span className="text-sm text-slate-500">{label}</span><span className="text-right text-sm font-medium text-slate-800">{value}</span></div>;
}
