import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, Eye, FileText, Plus, Search, SearchX } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { Pagination } from '../components/Pagination';
import { EmptyState, emptyKind } from '../components/ui/EmptyState';
import { searchQuotations } from '../search/quotationSearch';
import { useDebouncedValue } from '../search/useDebouncedValue';
import { DateRangeFilter } from '../components/historial/DateRangeFilter';
import { StatusCombo } from '../components/historial/StatusCombo';
import { QuotationActionsMenu } from '../components/QuotationActionsMenu';
import { QuotationPdfDialog } from '../components/QuotationPdfDialog';
import { useQuotationActions } from '../hooks/useQuotationActions';
import { useCancelledQuotationDeletion } from '../hooks/useCancelledQuotationDeletion';
import { useQuotationPdfDownload } from '../hooks/useQuotationPdfDownload';
import type { PublicQuotation, Quotation, QuotationStatus } from '../models/quotation';
import { useQuotations } from '../store/QuotationContext';
import { localDate } from '../utils/dateRangeUtils';
import type { DateRange } from '../utils/dateRangeUtils';
import { formatMoney } from '../utils/money';
import { calculateQuotationTotals, toPublicQuotation } from '../utils/quotation';
import { formatDate } from '../utils/dateFormat';
import '../styles/historial.css';

type StatusFilter = 'Todas' | QuotationStatus;
type OpenMenu = 'status' | 'range' | null;

const NO_RANGE: DateRange = { start: '', end: '' };
const STATUSES: StatusFilter[] = ['Todas', 'Aprobada', 'Pendiente', 'Cancelada', 'Vencida'];
const FLASH_MS = 2000;
const TOAST_MS = 3300;

const PAGE_SIZE = 20;
const statusFromParam = (value: string | null): StatusFilter => STATUSES.find((entry) => entry.toLowerCase() === value?.toLowerCase()) ?? 'Todas';
const pageFromParam = (value: string | null) => Math.max(1, Math.floor(Number(value)) || 1);
const folioNumber = (folio: string) => Number(folio.replace(/\D/g, '')) || 0;

export function HistoryPage() {
  const navigate = useNavigate();
  const { quotations, duplicateQuotation, isLoading } = useQuotations();
  const { requestApprove, requestCancel } = useQuotationActions();
  const { requestDelete } = useCancelledQuotationDeletion();
  const downloadPdf = useQuotationPdfDownload();
  // Search, status and page live in the URL so "back" from a quotation restores the same view.
  const [params, setParams] = useSearchParams();
  const committedSearch = params.get('q') ?? '';
  const status = statusFromParam(params.get('estado'));
  const requestedPage = pageFromParam(params.get('p'));
  const [search, setSearch] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(search);
  const cardRef = useRef<HTMLElement>(null);
  const [range, setRange] = useState<DateRange>(NO_RANGE);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [pdfTarget, setPdfTarget] = useState<PublicQuotation | null>(null);
  // `tick` alterna entre dos keyframes idénticos para reiniciar la cascada de filas en cada cambio.
  const [tick, setTick] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; folio: string } | null>(null);
  const toastKey = useRef(0);
  const flashTimer = useRef<number>();
  const toastTimer = useRef<number>();

  useEffect(() => () => {
    window.clearTimeout(flashTimer.current);
    window.clearTimeout(toastTimer.current);
  }, []);

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

  const filtered = useMemo(
    () => (status === 'Todas' ? searchAndRange : searchAndRange.filter((quotation) => quotation.status === status)),
    [searchAndRange, status],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const pageStart = (page - 1) * PAGE_SIZE;
  const visible = useMemo(() => filtered.slice(pageStart, pageStart + PAGE_SIZE), [filtered, pageStart]);

  function updateParams(changes: { q?: string; estado?: StatusFilter; p?: number }) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (changes.q !== undefined) { if (changes.q.trim()) next.set('q', changes.q); else next.delete('q'); }
      if (changes.estado !== undefined) { if (changes.estado !== 'Todas') next.set('estado', changes.estado.toLowerCase()); else next.delete('estado'); }
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
    count: value === 'Todas' ? searchAndRange.length : searchAndRange.filter((quotation) => quotation.status === value).length,
  })), [searchAndRange]);

  const hasFilters = search.trim() !== '' || committedSearch !== '' || status !== 'Todas' || hasRange;
  const bump = () => setTick((value) => value + 1);

  function changeSearch(value: string) { setSearch(value); }
  // Any filter change goes through updateParams without `p`, which restarts at page 1.
  function changeStatus(value: string) { updateParams({ estado: value as StatusFilter }); bump(); }
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

  async function handleDuplicate(quotation: Quotation) {
    const created = await duplicateQuotation(quotation.id, { silent: true });
    if (!created) return;
    clearFilters();
    setFlashId(created.id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(null), FLASH_MS);

    const key = ++toastKey.current;
    setToast({ key, folio: created.folio });
    window.clearTimeout(toastTimer.current);
    // Un toast anterior no debe cerrar al nuevo: solo se limpia si sigue siendo el vigente.
    toastTimer.current = window.setTimeout(() => setToast((current) => (current?.key === key ? null : current)), TOAST_MS);
  }

  const countLabel = `${filtered.length} ${filtered.length === 1 ? 'resultado' : 'resultados'}`;
  const kind = emptyKind(quotations.length, searched.length, filtered.length, committedSearch.trim() !== '', status !== 'Todas');

  return (
    <div className="hi-page" data-testid="historial-page">
      {openMenu && <button type="button" className="hi-backdrop" data-testid="hi-backdrop" tabIndex={-1} aria-label="Cerrar menú" onClick={() => setOpenMenu(null)} />}

      <header className="hi-header">
        <div>
          <p className="hi-eyebrow">Cotizaciones</p>
          <h1>Historial</h1>
          <p className="hi-sub">Busca, revisa y duplica cotizaciones anteriores.</p>
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
                        className={`hi-row${quotation.id === flashId ? ' hi-flash' : ''}`}
                        data-testid="hi-row"
                        data-folio={quotation.folio}
                        style={{ animationName: tick % 2 === 0 ? 'hiRowInA' : 'hiRowInB', animationDelay: `${Math.min(index, 10) * 35}ms` }}
                      >
                        <td className="hi-folio">{quotation.folio}</td>
                        <td className="hi-date">{formatDate(quotation.createdAt, 'medium')}</td>
                        <td className="hi-client">{quotation.customer.name}</td>
                        <td className="hi-vehicle">{quotation.vehicle.make} {quotation.vehicle.model}</td>
                        <td><span className="hi-badge" data-status={quotation.status} data-testid="hi-badge"><i aria-hidden="true" />{quotation.status}</span></td>
                        <td className="hi-right hi-total">{formatMoney(total)}</td>
                        <td>
                          <div className="hi-actions">
                            <button type="button" className="hi-icon" data-testid={`hi-view-${quotation.folio}`} title={`Ver detalle ${quotation.folio}`} aria-label={`Ver detalle ${quotation.folio}`} onClick={() => navigate(`/cotizaciones/${quotation.id}`)}><Eye size={18} aria-hidden="true" /></button>
                            <button type="button" className="hi-icon" data-testid={`hi-dup-${quotation.folio}`} title={`Duplicar ${quotation.folio}`} aria-label={`Duplicar ${quotation.folio}`} onClick={() => void handleDuplicate(quotation)}><Copy size={18} aria-hidden="true" /></button>
                            <button type="button" className="hi-icon" data-testid={`hi-pdf-${quotation.folio}`} title={`Descargar PDF ${quotation.folio}`} aria-label={`Descargar PDF ${quotation.folio}`} onClick={() => downloadPdf(quotation)}><Download size={18} aria-hidden="true" /></button>
                            <QuotationActionsMenu
                              quotation={quotation}
                              omit={['view', 'download', 'duplicate']}
                              triggerClassName="hi-icon"
                              onOpenPdf={(target) => setPdfTarget(toPublicQuotation(target))}
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
              <span data-testid="hi-range">{pageStart + 1}–{pageStart + visible.length} de {filtered.length}</span>
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
        </section>
      </div>

      {toast && (
        <div key={toast.key} className="hi-toast" role="status" data-testid="hi-toast">
          <span className="hi-toast-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 12.5l4.2 4.2L18.5 7.8" pathLength="1" className="hi-draw" /></svg>
          </span>
          Cotización duplicada como {toast.folio}
        </div>
      )}

      {pdfTarget && <QuotationPdfDialog quotation={pdfTarget} onClose={() => setPdfTarget(null)} />}
    </div>
  );
}

