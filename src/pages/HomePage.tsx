import { useMemo, useState } from 'react';
import { ArrowRight, ChevronRight, FilePlus2, FileText, Search } from 'lucide-react';
import { Link } from 'react-router';
import { Pagination } from '../components/Pagination';
import { QuotationPdfDialog } from '../components/QuotationPdfDialog';
import { QuotationTable } from '../components/QuotationTable';
import { useQuotationActions } from '../hooks/useQuotationActions';
import { useCancelledQuotationDeletion } from '../hooks/useCancelledQuotationDeletion';
import type { PublicQuotation, Quotation, QuotationStatus } from '../models/quotation';
import { useQuotations } from '../store/QuotationContext';
import { toPublicQuotation } from '../utils/quotation';

const homeArtwork = new URL('../../diseño inicio.png', import.meta.url).href;

const PAGE_SIZE = 5;

const STATUS_TABS: ReadonlyArray<{ value: 'Todas' | QuotationStatus; label: string }> = [
  { value: 'Todas', label: 'Todas' },
  { value: 'Pendiente', label: 'Pendientes' },
  { value: 'Aprobada', label: 'Aprobadas' },
  { value: 'Cancelada', label: 'Canceladas' },
  { value: 'Vencida', label: 'Vencidas' },
];

export function HomePage() {
  const { quotations, isLoading, duplicateQuotation } = useQuotations();
  const { requestApprove, requestCancel, confirmDialog } = useQuotationActions();
  const { requestDelete, confirmDialog: deleteConfirmDialog } = useCancelledQuotationDeletion();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'Todas' | QuotationStatus>('Todas');
  const [page, setPage] = useState(1);
  const [pdfTarget, setPdfTarget] = useState<PublicQuotation | null>(null);

  const filteredQuotations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-MX');
    return [...quotations]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((quotation) => {
        const matchesStatus = status === 'Todas' || quotation.status === status;
        const matchesQuery = !query || `${quotation.folio} ${quotation.customer.name}`.toLocaleLowerCase('es-MX').includes(query);
        return matchesStatus && matchesQuery;
      });
  }, [quotations, search, status]);

  const pageCount = Math.max(1, Math.ceil(filteredQuotations.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleQuotations = useMemo(
    () => filteredQuotations.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredQuotations, currentPage],
  );

  function applyFilter(next: { search?: string; status?: 'Todas' | QuotationStatus }) {
    if (next.search !== undefined) setSearch(next.search);
    if (next.status !== undefined) setStatus(next.status);
    setPage(1);
  }

  async function handleDuplicate(quotation: Quotation) {
    await duplicateQuotation(quotation.id);
  }

  return (
    <>
      <section className="relative isolate mb-4 overflow-hidden rounded-xl border border-orange-100 bg-gradient-to-r from-white via-[#fffaf4] to-[#ffe7d2] shadow-card">
        <img
          src={homeArtwork}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[9%] right-0 hidden h-[120%] w-auto max-w-none select-none xl:block"
        />
        <div className="relative z-10 flex min-h-[194px] items-center px-5 py-6 sm:px-8">
          <div className="flex max-w-xl items-start gap-4 sm:items-center sm:gap-5">
            <FilePlus2 size={48} strokeWidth={1.8} aria-hidden="true" className="mt-1 shrink-0 text-orange-600 sm:mt-0 sm:size-14" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-navy-950 sm:text-[30px]">Crea una nueva cotización</h1>
              <Link
                to="/nueva-cotizacion"
                className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-orange-500 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
              >
                <FilePlus2 size={18} />
                Nueva cotización
                <ArrowRight size={16} className="ml-1" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <FileText size={21} aria-hidden="true" className="shrink-0 text-navy-900" />
            <h2 className="text-lg font-bold tracking-tight text-navy-950 sm:text-xl">Cotizaciones recientes</h2>
          </div>
          <Link to="/historial" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 sm:text-sm">
            Ver historial completo
            <ChevronRight size={15} />
          </Link>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Buscar cotizaciones por folio o cliente</span>
            <Search size={17} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="form-input pl-10"
              value={search}
              onChange={(event) => applyFilter({ search: event.target.value })}
              placeholder="Buscar por folio o cliente..."
            />
          </label>

          <div role="group" aria-label="Filtrar cotizaciones por estado" className="flex shrink-0 flex-wrap items-center gap-2">
            {STATUS_TABS.map((tab) => {
              const isActive = tab.value === status;
              const dotColor = tab.value === 'Pendiente' ? 'bg-amber-500' : tab.value === 'Aprobada' ? 'bg-emerald-500' : tab.value === 'Cancelada' ? 'bg-rose-500' : tab.value === 'Vencida' ? 'bg-slate-500' : '';
              return (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => applyFilter({ status: tab.value })}
                  className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition ${isActive ? 'border-orange-500 bg-orange-50/50 text-orange-600' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-navy-950'}`}
                >
                  {dotColor && <span aria-hidden="true" className={`size-1.5 rounded-full ${dotColor}`} />}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading
          ? <p className="py-10 text-center text-sm text-slate-500">Cargando cotizaciones…</p>
          : <QuotationTable
            quotations={visibleQuotations}
            onOpenPdf={(quotation) => setPdfTarget(toPublicQuotation(quotation))}
            onApprove={requestApprove}
            onCancel={requestCancel}
            onDuplicate={(quotation) => void handleDuplicate(quotation)}
            onDelete={requestDelete}
          />}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">Mostrando {visibleQuotations.length} de {filteredQuotations.length} cotizaciones</p>
          <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
        </div>
      </section>

      {pdfTarget && <QuotationPdfDialog quotation={pdfTarget} onClose={() => setPdfTarget(null)} />}

      {confirmDialog}
      {deleteConfirmDialog}
    </>
  );
}
