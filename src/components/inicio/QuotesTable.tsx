import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AnimationEvent } from 'react';
import { ChevronRight, FileText, Search, SearchX } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Pagination } from '../Pagination';
import { EmptyState, emptyKind } from '../ui/EmptyState';
import { searchQuotations } from '../../search/quotationSearch';
import { useDebouncedValue } from '../../search/useDebouncedValue';
import { QuotationActionsMenu } from '../QuotationActionsMenu';
import { QuotationPdfDialog } from '../QuotationPdfDialog';
import { ShareStatusLine } from '../share/ShareStatusLine';
import { countPendingUnshared, pendingUnsharedText } from '../../services/shareFilter';
import { StatusBadge } from '../StatusBadge';
import { useQuotationDeletion } from '../../hooks/useQuotationDeletion';
import { useQuotationActions } from '../../hooks/useQuotationActions';
import { useQuotationPdfDownload } from '../../hooks/useQuotationPdfDownload';
import type { PublicQuotation, QuotationStatus } from '../../models/quotation';
import { useQuotations } from '../../store/QuotationContext';
import { formatMoney } from '../../utils/money';
import { calculateQuotationTotals, toPublicQuotation } from '../../utils/quotation';
import { formatDate } from '../../utils/dateFormat';

const PAGE_SIZE = 5;

type StatusFilter = 'Todas' | QuotationStatus;

const STATUS_TABS: ReadonlyArray<{ value: StatusFilter; label: string; dot?: string }> = [
  { value: 'Todas', label: 'Todas' },
  { value: 'Pendiente', label: 'Pendientes', dot: 'bg-[#f08a24]' },
  { value: 'Aprobada', label: 'Aprobadas', dot: 'bg-[#34c759]' },
  { value: 'Cancelada', label: 'Canceladas', dot: 'bg-[#ff3b30]' },
  { value: 'Vencida', label: 'Vencidas', dot: 'bg-[#8e8e93]' },
];

export function QuotesTable() {
  const { quotations, isLoading } = useQuotations();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState<StatusFilter>('Todas');
  const [page, setPage] = useState(1);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [pdfTarget, setPdfTarget] = useState<PublicQuotation | null>(null);
  const { requestApprove, requestCancel } = useQuotationActions((updated) => setFlashId(updated.id));
  const { requestDelete } = useQuotationDeletion();
  const downloadPdf = useQuotationPdfDownload();

  const sortedQuotations = useMemo(
    () => [...quotations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [quotations],
  );

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { Todas: sortedQuotations.length, Pendiente: 0, Aprobada: 0, Cancelada: 0, Vencida: 0 };
    for (const quotation of sortedQuotations) result[quotation.status] += 1;
    return result;
  }, [sortedQuotations]);

  const pendingUnshared = useMemo(() => countPendingUnshared(quotations), [quotations]);

  const searched = useMemo(() => searchQuotations(sortedQuotations, debouncedSearch), [sortedQuotations, debouncedSearch]);
  const filteredQuotations = useMemo(
    () => (status === 'Todas' ? searched : searched.filter((quotation) => quotation.status === status)),
    [searched, status],
  );

  const pageCount = Math.max(1, Math.ceil(filteredQuotations.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleQuotations = filteredQuotations.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function applyFilter(next: { search?: string; status?: StatusFilter }) {
    if (next.search !== undefined) setSearch(next.search);
    if (next.status !== undefined) setStatus(next.status);
    setPage(1);
  }

  function handleRowAnimationEnd(event: AnimationEvent<HTMLTableRowElement>) {
    // rowIn y las animaciones de los hijos también burbujean hasta la fila.
    if (event.animationName === 'rowFlash') setFlashId(null);
  }

  return (
    <section className="rise overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-mac-card" style={{ animationDelay: '120ms' }} aria-labelledby="recientes-title">
      <div className="flex items-center justify-between gap-4 px-5 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-mac-tint text-mac-accent-text">
            <FileText size={15} />
          </span>
          <h2 id="recientes-title" className="text-[15px] font-semibold tracking-[-0.01em] text-mac-ink">Cotizaciones recientes</h2>
        </div>
        <Link to="/historial" data-testid="ver-historial" className="inline-flex shrink-0 items-center gap-0.5 rounded-md text-[12px] font-semibold text-mac-accent-text transition-colors hover:text-mac-accent">
          Ver historial completo
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {pendingUnshared > 0 && (
        <p className="px-5 pb-3 text-[12px]">
          <Link to="/historial?estado=pendiente&envio=sin-compartir" data-testid="pendientes-sin-compartir" className="rounded-md font-semibold text-mac-accent-text underline-offset-2 transition-colors hover:text-mac-accent hover:underline">{pendingUnsharedText(pendingUnshared)}</Link>
        </p>
      )}

      <div className="flex flex-col gap-3 px-5 pb-4 lg:flex-row lg:items-center">
        <label className="inicio-search w-full lg:w-auto lg:flex-1">
          <Search size={15} aria-hidden="true" className="flex-none" />
          <span className="sr-only">Buscar cotizaciones por folio, cliente, teléfono, vehículo o concepto</span>
          <input
            type="search"
            data-testid="inicio-buscar"
            value={search}
            onChange={(event) => applyFilter({ search: event.target.value })}
            placeholder="Buscar por folio, cliente, teléfono o vehículo..."
          />
        </label>
        <StatusSegment value={status} counts={counts} onChange={(value) => applyFilter({ status: value })} />
      </div>

      {isLoading
        ? <p className="border-t border-mac-separator py-12 text-center text-[13px] text-mac-ink-2">Cargando cotizaciones…</p>
        : visibleQuotations.length === 0
          ? (
            <QuotesEmpty
              kind={emptyKind(sortedQuotations.length, searched.length, filteredQuotations.length, debouncedSearch.trim() !== '', status !== 'Todas') ?? 'search'}
              search={debouncedSearch.trim()}
              status={status}
              onCreate={() => navigate('/nueva-cotizacion')}
              onClearSearch={() => { setSearch(''); setPage(1); }}
              onClearStatus={() => applyFilter({ status: 'Todas' })}
            />
          )
          : (
            <div className="overflow-x-auto">
              <table className="inicio-table" data-testid="tabla-recientes">
                <colgroup>
                  <col className="w-[11%]" />
                  <col className="w-[13%]" />
                  <col className="w-[20%]" />
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                  <col className="w-[15%]" />
                  <col className="w-[9%]" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Folio</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Vehículo</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="text-right">Total</th>
                    <th scope="col" className="text-right">Acciones</th>
                  </tr>
                </thead>
                {/* La clave reinicia la entrada escalonada al cambiar de filtro, búsqueda o página. */}
                <tbody key={`${status}|${debouncedSearch}|${currentPage}`}>
                  {visibleQuotations.map((quotation, index) => {
                    const totals = calculateQuotationTotals(quotation.items, quotation.laborDiscountType, quotation.laborDiscountValue, quotation.includeVat);
                    const vehicle = `${quotation.vehicle.make} ${quotation.vehicle.model}`.trim();
                    const isFlashing = flashId === quotation.id;
                    return (
                      <tr
                        key={quotation.id}
                        data-testid={`fila-${quotation.folio}`}
                        className={`row-in ${isFlashing ? 'row-flash' : ''}`}
                        style={{ animationDelay: `${index * 35}ms` }}
                        onAnimationEnd={handleRowAnimationEnd}
                      >
                        <td className="font-semibold text-mac-ink">{quotation.folio}</td>
                        <td className="num text-mac-ink-2">{formatDate(quotation.createdAt, 'medium')}</td>
                        <td className="max-w-0 font-semibold text-mac-ink"><span className="block truncate" aria-hidden="true" title={quotation.customer.name}>{quotation.customer.name}</span><ShareStatusLine record={quotation} customerName={quotation.customer.name} /></td>
                        <td className="max-w-0 truncate text-mac-ink-2" title={quotation.vehicle.year ? `${vehicle} ${quotation.vehicle.year}` : vehicle}>{vehicle}</td>
                        <td>
                          <span key={quotation.status} className={isFlashing ? 'badge-pop' : undefined}>
                            <StatusBadge status={quotation.status} size="sm" />
                          </span>
                        </td>
                        <td className="num text-right font-semibold text-mac-ink">{formatMoney(totals.total)}</td>
                        <td className="text-right">
                          <div className="flex justify-end">
                            <QuotationActionsMenu
                              quotation={quotation}
                              onOpenPdf={(target) => setPdfTarget(toPublicQuotation(target))}
                              onDownloadPdf={downloadPdf}
                              onApprove={requestApprove}
                              onCancel={requestCancel}
                              onDelete={requestDelete}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <p className="text-[12px] text-mac-ink-2" data-testid="inicio-conteo" aria-live="polite">Mostrando {visibleQuotations.length} de {filteredQuotations.length} cotizaciones</p>
        <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
      </div>

      {pdfTarget && <QuotationPdfDialog quotation={pdfTarget} onClose={() => setPdfTarget(null)} />}
    </section>
  );
}

interface StatusSegmentProps {
  value: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (value: StatusFilter) => void;
}

/** Control segmentado cuya píldora blanca se desliza hasta la opción activa. */
function StatusSegment({ value, counts, onChange }: StatusSegmentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);
  const [isReady, setIsReady] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function measure() {
      const active = container?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      if (active) setPill({ x: active.offsetLeft, width: active.offsetWidth });
    }
    measure();
    // La primera posición se pinta sin transición; a partir de ahí la píldora se desliza.
    const frame = requestAnimationFrame(() => setIsReady(true));
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container.querySelectorAll('button').forEach((button) => observer.observe(button));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [value, counts]);

  return (
    <div ref={containerRef} role="group" aria-label="Filtrar cotizaciones por estado" className="inicio-segment self-start lg:self-auto">
      {pill && (
        <span
          aria-hidden="true"
          className="inicio-segment-pill"
          style={{ width: pill.width, transform: `translateX(${pill.x}px)`, transition: isReady ? undefined : 'none' }}
        />
      )}
      {STATUS_TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          aria-pressed={tab.value === value}
          data-testid={`filtro-${tab.value}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.dot && <span aria-hidden="true" className={`size-1.5 rounded-full ${tab.dot}`} />}
          {tab.label}
          <span className="inicio-segment-count">{counts[tab.value]}</span>
        </button>
      ))}
    </div>
  );
}

interface QuotesEmptyProps {
  kind: 'none' | 'search' | 'status';
  search: string;
  status: StatusFilter;
  onCreate: () => void;
  onClearSearch: () => void;
  onClearStatus: () => void;
}

function QuotesEmpty({ kind, search, status, onCreate, onClearSearch, onClearStatus }: QuotesEmptyProps) {
  if (kind === 'none') {
    return <EmptyState bordered testId="inicio-vacio" icon={<FileText size={22} />} title="Aún no hay cotizaciones" text="Crea la primera desde el botón «Nueva cotización»." action={{ label: 'Crear cotización', onClick: onCreate, variant: 'primary', testId: 'inicio-vacio-crear' }} />;
  }
  if (kind === 'status') {
    return <EmptyState bordered testId="inicio-vacio" icon={<SearchX size={22} />} title={`No hay cotizaciones con estado ${status}`} action={{ label: 'Quitar filtro', onClick: onClearStatus, testId: 'inicio-vacio-quitar' }} />;
  }
  return <EmptyState bordered testId="inicio-vacio" icon={<SearchX size={22} />} title={`Sin resultados para «${search}»`} text="Prueba con otro folio, nombre, teléfono, placas o concepto." action={{ label: 'Limpiar búsqueda', onClick: onClearSearch, testId: 'inicio-vacio-limpiar' }} />;
}
