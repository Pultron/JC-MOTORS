import { useMemo, useState } from 'react';
import { Copy, Search, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { QuotationPdfDialog } from '../components/QuotationPdfDialog';
import { QuotationTable } from '../components/QuotationTable';
import { useQuotationActions } from '../hooks/useQuotationActions';
import type { PublicQuotation, QuotationStatus } from '../models/quotation';
import { useQuotations } from '../store/QuotationContext';
import { getMonthKey, toPublicQuotation } from '../utils/quotation';

const statuses: Array<'Todas' | QuotationStatus> = ['Todas', 'Pendiente', 'Aprobada', 'Cancelada'];

export function HistoryPage() {
  const navigate = useNavigate();
  const { quotations, duplicateQuotation, isLoading } = useQuotations();
  const { requestApprove, requestCancel, confirmDialog } = useQuotationActions();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'Todas' | QuotationStatus>('Todas');
  const [month, setMonth] = useState('');
  const [pdfTarget, setPdfTarget] = useState<PublicQuotation | null>(null);

  const filteredQuotations = useMemo(() => quotations.filter((quotation) => {
    const matchesSearch = `${quotation.folio} ${quotation.customer.name}`.toLocaleLowerCase('es-MX').includes(search.trim().toLocaleLowerCase('es-MX'));
    const matchesStatus = status === 'Todas' || quotation.status === status;
    const matchesMonth = !month || getMonthKey(quotation.createdAt) === month;
    return matchesSearch && matchesStatus && matchesMonth;
  }), [quotations, search, status, month]);

  async function handleDuplicate(id: string) {
    const quotation = await duplicateQuotation(id);
    if (quotation) navigate(`/cotizaciones/${quotation.id}`);
  }

  return (
    <>
      <PageHeader eyebrow="Cotizaciones" title="Historial" description="Busca, revisa y duplica cotizaciones anteriores." actions={<Button variant="primary" icon={<Copy size={16} />} onClick={() => navigate('/nueva-cotizacion')}>Nueva cotización</Button>} />
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Buscar por folio o nombre del cliente</span><Search size={17} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input className="form-input pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por folio o nombre del cliente" /></label>
          <div className="flex flex-wrap gap-3">
            <label className="relative"><span className="sr-only">Filtrar por estado</span><SlidersHorizontal size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><select className="form-input min-w-40 appearance-none pl-9 pr-8" value={status} onChange={(event) => setStatus(event.target.value as 'Todas' | QuotationStatus)}>{statuses.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label className="flex items-center gap-2"><span className="sr-only">Filtrar por mes</span><input aria-label="Filtrar por mes" className="form-input min-w-40" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-400">{filteredQuotations.length} {filteredQuotations.length === 1 ? 'cotización' : 'cotizaciones'}</p>
        {isLoading ? <p className="py-8 text-center text-sm text-slate-500">Cargando cotizaciones…</p> : <QuotationTable
          quotations={filteredQuotations}
          onOpenPdf={(quotation) => setPdfTarget(toPublicQuotation(quotation))}
          onApprove={requestApprove}
          onCancel={requestCancel}
          onDuplicate={(quotation) => void handleDuplicate(quotation.id)}
        />}
      </section>

      {pdfTarget && <QuotationPdfDialog quotation={pdfTarget} onClose={() => setPdfTarget(null)} />}

      {confirmDialog}
    </>
  );
}