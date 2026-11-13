import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Plus, Search, SearchX, Send } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { Pagination } from '../components/Pagination';
import { EmptyState, emptyKind } from '../components/ui/EmptyState';
import { searchQuotations } from '../search/quotationSearch';
import { useDebouncedValue } from '../search/useDebouncedValue';
import { DateRangeFilter } from '../components/historial/DateRangeFilter';
import { StatusCombo } from '../components/historial/StatusCombo';
import { filterByShare, SHARE_FILTERS, SHARE_FILTER_LABEL, shareFilterEmptyTitle, shareFilterFromParam } from '../services/shareFilter';
import type { ShareFilter } from '../services/shareFilter';
import { QuotationActionsMenu } from '../components/QuotationActionsMenu';
import { QuotationPdfDialog } from '../components/QuotationPdfDialog';
import { ShareStatusLine } from '../components/share/ShareStatusLine';
import { useQuotationActions } from '../hooks/useQuotationActions';
import { useQuotationDeletion } from '../hooks/useQuotationDeletion';
import { useQuotationPdfDownload } from '../hooks/useQuotationPdfDownload';
import type { PublicQuotation, QuotationStatus } from '../models/quotation';
import { useQuotations } from '../store/QuotationContext';
import { localDate } from '../utils/dateRangeUtils';
import type { DateRange } from '../utils/dateRangeUtils';
import { formatMoney } from '../utils/money';
import { calculateQuotationTotals, toPublicQuotation } from '../utils/quotation';
import { formatDate } from '../utils/dateFormat';
import '../styles/historial.css';

type StatusFilter = 'Todas' | QuotationStatus;
type OpenMenu = 'status' | 'envio' | 'range' | null;

const NO_RANGE: DateRange = { start: '', end: '' };
const STATUSES: StatusFilter[] = ['Todas', 'Aprobada', 'Pendiente', 'Cancelada', 'Vencida'];

const PAGE_SIZE = 20;
const statusFromParam = (value: string | null): StatusFilter => STATUSES.find((entry) => entry.toLowerCase() === value?.toLowerCase()) ?? 'Todas';
const pageFromParam = (value: string | null) => Math.max(1, Math.floor(Number(value)) || 1);
const folioNumber = (folio: string) => Number(folio.replace(/\D/g, '')) || 0;

export function HistoryPage() {
  const navigate = useNavigate();
  const { quotations, isLoading } = useQuotations();
  const { requestApprove, requestCancel } = useQuotationActions();
  const { requestDelete } = useQuotationDeletion();
  const downloadPdf = useQuotationPdfDownload();
  // Search, status and page live in the URL so "back" from a quotation restores the same view.
  const [params, setParams] = useSearchParams();
  const committedSearch = params.get('q') ?? '';
  const status = statusFromParam(params.get('estado'));
  const share = shareFilterFromParam(params.get('envio'));
  const requestedPage = pageFromParam(params.get('p'));
  const [search, setSearch] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(search);
  const cardRef = useRef<HTMLElement>(null);
  const [range, setRange] = useState<DateRange>(NO_RANGE);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [pdfTarget, setPdfTarget] = useState<PublicQuotation | null>(null);
  // `tick` alterna entre dos keyframes idénticos para reiniciar la cascada de filas en cada cambio.
  const [tick, setTick] = useState(0);

  const sorted = useMemo(() => [...quotations].sort((a, b) => {
    const byDate = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return byDate || folioNumber(b.folio) - folioNumber(a.folio);
  }), [quotations]);

  const hasRange = Boolean(range.start && range.end);
  const searched = useMemo(() => searchQuotations(sorted, committedSearch), [sorted, committedSearch]);
  const searchAndRange = useMemo(() => (!hasRange ? searched : searched.filter((quotation) => {
    const day = localDate(new Date(quotation.createdAt));
    return day >= range.start && day <= range.end;
  })), [searched, range, hasRange]);

  const byStatus = useMemo(
    () => (status === 'Todas' ? searchAndRange : searchAndRange.filter((quotation) => quotation.status === status)),
    [searchAndRange, status],
  );
  const filtered = useMemo(() => filterByShare(byStatus, share), [byStatus, share]);
  const byShare = useMemo(() => filterByShare(searchAndRange, share), [searchAndRange, share]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const pageStart = (page - 1) * PAGE_SIZE;
  const visible = useMemo(() => filtered.slice(pageStart, pageStart + PAGE_SIZE), [filtered, pageStart]);

  function updateParams(changes: { q?: string; estado?: StatusFilter; envio?: ShareFilter; p?: number }) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (changes.q !== undefined) { if (changes.q.trim()) next.set('q', changes.q); else next.delete('q'); }
      if (changes.estado !== undefined) { if (changes.estado !== 'Todas') next.set('estado', changes.estado.toLowerCase()); else next.delete('estado'); }
      if (changes.envio !== undefined) { if (changes.envio !== 'todas') next.set('envio', changes.envio); else next.delete('envio'); }
      if (changes.p !== undefined && changes.p > 1) next.set('p', String(changes.p));
      else next.delete('p');
      return next;
    }, { replace: true });
  }

  // The debounced text becomes the committed (URL) search and always restarts at page 1.
  useEffect(() => {
    if (debouncedSearch !== committedSearch) { updateParams({ q: debouncedSearch }); setTick((value) => value + 1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const statusOptions = useMemo(() => STATUSES.map((value) => ({
    value,
    label: value,
    count: value === 'Todas' ? byShare.length : byShare.filter((quotation) => quotation.status === value).length,
  })), [byShare]);

  const shareOptions = useMemo(() => SHARE_FILTERS.map((value) => ({
    value,
    label: SHARE_FILTER_LABEL[value],
    count: filterByShare(status === 'Todas' ? searchAndRange : searchAndRange.filter((quotation) => quotation.status === status), value).length,
  })), [searchAndRange, status]);

  const hasFilters = search.trim() !== '' || committedSearch !== '' || status !== 'Todas' || share !== 'todas' || hasRange;
  const bump = () => setTick((value) => value + 1);

  function changeSearch(value: string) { setSearch(value); }
  // Any filter change goes through updateParams without `p`, which restarts at page 1.
  function changeStatus(value: string) { updateParams({ estado: value as StatusFilter }); bump(); }
  function changeShare(value: string) { updateParams({ envio: value as ShareFilter }); bump(); }
  function changeRange(value: DateRange) { setRange(value); updateParams({}); bump(); }
  function changePage(next: number) {
    updateParams({ p: next });
    bump();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    cardRef.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }
  function clearSearch() { setSearch(''); updateParams({ q: '' }); bump(); }
  function clearFilters() {
    setSearch('');
    setRange(NO_RANGE);
    setOpenMenu(null);
    setParams(new URLSearchParams(), { replace: true });
    bump();
  }

  const countLabel = `${filtered.length} ${filtered.length === 1 ? 'resultado' : 'resultados'}`;
  // A share filter counts as an active filter for emptyKind; when it is the reason for the empty result it gets its own message.
  const baseKind = emptyKind(quotations.length, searched.length, filtered.length, committedSearch.trim() !== '', status !== 'Todas' || share !== 'todas');
  const kind = baseKind === 'status' && share !== 'todas' ? 'envio' : baseKind;

  return (
    <div className="hi-page" data-testid="historial-page">
      {openMenu && <button type="button" className="hi-backdrop" data-testid="hi-backdrop" tabIndex={-1} aria-label="Cerrar menú" onClick={() => setOpenMenu(null)} />}

      <header className="hi-header">
        <div>
          <h1>Historial</h1>
        </div>
        <button type="button" className="hi-btn hi-btn--primary" data-testid="hi-new" onClick={() => navigate('/nueva-cotizacion')}>
          <Plus size={16} strokeWidth={2.4} aria-hidden="true" />Nueva cotización
        </button>
      </header>

      <div className="hi-body">
        <section ref={cardRef} className="hi-card" aria-label="Historial de cotizaciones">
          <div className="hi-toolbar">
            <label className="hi-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                data-testid="hi-search"
                aria-label="Buscar por folio, cliente o vehículo"
                placeholder="Buscar por folio, cliente, teléfono o vehículo"
                value={search}
                autoComplete="off"
                onChange={(event) => changeSearch(event.target.value)}
              />
            </label>
            <StatusCombo value={status} options={statusOptions} open={openMenu === 'status'} onOpenChange={(open) => setOpenMenu(open ? 'status' : null)} onChange={changeStatus} />
            <StatusCombo
              value={share}
              options={shareOptions}
              open={openMenu === 'envio'}
              onOpenChange={(open) => setOpenMenu(open ? 'envio' : null)}
              onChange={changeShare}
              testId="hi-envio"
              ariaLabel="Filtrar por envío"
              menuLabel="Envío"
              className="hi-ctl--share"
              icon={<Send size={15} aria-hidden="true" className="hi-ctl-lead" />}
            />
            <DateRangeFilter value={range} open={openMenu === 'range'} onOpenChange={(open) => setOpenMenu(open ? 'range' : null)} onChange={changeRange} />
          </div>

          <div className="hi-count">
            <span aria-live="polite" data-testid="hi-count">{isLoading ? 'Cargando cotizaciones…' : countLabel}</span>
            {hasFilters && <button type="button" className="hi-link" data-testid="hi-clear" onClick={clearFilters}>Limpiar filtros</button>}
          </div>

          {!isLoading && filtered.length > 0 && (
            <div className="hi-table-wrap">
              <table className="hi-table">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Vehículo</th>
                    <th>Estado</th>
                    <th className="hi-right">Total</th>
                    <th className="hi-sr-only">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((quotation, index) => {
                    const { total } = calculateQuotationTotals(quotation.items, quotation.laborDiscountType, quotation.laborDiscountValue, quotation.includeVat);
                    return (
                      <tr
                        key={quotation.id}
                        className="hi-row"
                        data-testid="hi-row"
                        data-folio={quotation.folio}
                        style={{ animationName: tick % 2 === 0 ? 'hiRowInA' : 'hiRowInB', animationDelay: `${Math.min(index, 10) * 35}ms` }}
                      >
                        <td className="hi-folio">{quotation.folio}</td>
                        <td className="hi-date">{formatDate(quotation.createdAt, 'medium')}</td>
                        <td className="hi-client"><span className="hi-client-name" aria-hidden="true" title={quotation.customer.name}>{quotation.customer.name}</span><ShareStatusLine record={quotation} customerName={quotation.customer.name} /></td>
                        <td className="hi-vehicle">{quotation.vehicle.make} {quotation.vehicle.model}</td>
                        <td><span className="hi-badge" data-status={quotation.status} data-testid="hi-badge"><i aria-hidden="true" />{quotation.status}</span></td>
                        <td className="hi-right hi-total">{formatMoney(total)}</td>
                        <td>
                          <div className="hi-actions">
                            <QuotationActionsMenu
                              quotation={quotation}
                              triggerClassName="hi-icon"
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

          {!isLoading && filtered.length > 0 && (
            <div className="hi-pager">
              <span data-testid="hi-page-range">{pageStart + 1}–{pageStart + visible.length} de {filtered.length}</span>
              <Pagination page={page} pageCount={pageCount} onPageChange={changePage} ariaLabel="Paginación del historial" />
            </div>
          )}

          {!isLoading && filtered.length === 0 && kind === 'none' && (
            <EmptyState testId="hi-empty" icon={<FileText size={22} />} title="Aún no hay cotizaciones" text="Crea la primera con «Nueva cotización»." action={{ label: 'Crear cotización', variant: 'primary', testId: 'hi-empty-crear', onClick: () => navigate('/nueva-cotizacion') }} />
          )}
          {!isLoading && filtered.length === 0 && kind === 'search' && (
            committedSearch.trim() !== ''
              ? <EmptyState testId="hi-empty" icon={<SearchX size={22} />} title={`Sin resultados para «${committedSearch.trim()}»`} text="Prueba con otro folio, nombre, teléfono, placas o concepto." action={{ label: 'Limpiar búsqueda', testId: 'hi-empty-clear', onClick: clearSearch }} />
              : <EmptyState testId="hi-empty" icon={<SearchX size={22} />} title="No hay cotizaciones en ese rango de fechas" action={{ label: 'Limpiar filtros', testId: 'hi-empty-clear', onClick: clearFilters }} />
          )}
          {!isLoading && filtered.length === 0 && kind === 'status' && (
            <EmptyState testId="hi-empty" icon={<SearchX size={22} />} title={`No hay cotizaciones con estado ${status}`} action={{ label: 'Quitar filtro', testId: 'hi-empty-clear', onClick: () => changeStatus('Todas') }} />
          )}
          {!isLoading && filtered.length === 0 && kind === 'envio' && (
            <EmptyState testId="hi-empty" icon={<SearchX size={22} />} title={shareFilterEmptyTitle(share)} action={{ label: 'Quitar filtro', testId: 'hi-empty-clear', onClick: () => changeShare('todas') }} />
          )}
        </section>
      </div>

      {pdfTarget && <QuotationPdfDialog quotation={pdfTarget} onClose={() => setPdfTarget(null)} />}
    </div>
  );
}

