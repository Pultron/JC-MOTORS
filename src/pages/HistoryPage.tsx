import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, Eye, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router';
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
import { calculateQuotationTotals, formatDate, toPublicQuotation } from '../utils/quotation';
import '../styles/historial.css';

type StatusFilter = 'Todas' | QuotationStatus;
type OpenMenu = 'status' | 'range' | null;

const NO_RANGE: DateRange = { start: '', end: '' };
const STATUSES: StatusFilter[] = ['Todas', 'Aprobada', 'Pendiente', 'Cancelada', 'Vencida'];
const FLASH_MS = 2000;
const TOAST_MS = 3300;

const normalize = (value: string) => value.toLocaleLowerCase('es-MX');
const folioNumber = (folio: string) => Number(folio.replace(/\D/g, '')) || 0;
const formatTotal = (amount: number) => `MXN $${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function HistoryPage() {
  const navigate = useNavigate();
  const { quotations, duplicateQuotation, isLoading } = useQuotations();
  const { requestApprove, requestCancel } = useQuotationActions();
  const { requestDelete } = useCancelledQuotationDeletion();
  const downloadPdf = useQuotationPdfDownload();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('Todas');
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
  const searchAndRange = useMemo(() => {
    const term = normalize(search.trim());
    return sorted.filter((quotation) => {
      const haystack = normalize(`${quotation.folio} ${quotation.customer.name} ${quotation.vehicle.make} ${quotation.vehicle.model}`);
      return haystack.includes(term) && (!hasRange || (localDate(new Date(quotation.createdAt)) >= range.start && localDate(new Date(quotation.createdAt)) <= range.end));
    });
  }, [sorted, search, range, hasRange]);

  const filtered = useMemo(
    () => (status === 'Todas' ? searchAndRange : searchAndRange.filter((quotation) => quotation.status === status)),
    [searchAndRange, status],
  );

  const statusOptions = useMemo(() => STATUSES.map((value) => ({
    value,
    label: value,
    count: value === 'Todas' ? searchAndRange.length : searchAndRange.filter((quotation) => quotation.status === value).length,
  })), [searchAndRange]);

  const hasFilters = search.trim() !== '' || status !== 'Todas' || hasRange;
  const bump = () => setTick((value) => value + 1);

  function changeSearch(value: string) { setSearch(value); bump(); }
  function changeStatus(value: string) { setStatus(value as StatusFilter); bump(); }
  function changeRange(value: DateRange) { setRange(value); bump(); }
  function clearFilters() {
    setSearch('');
    setStatus('Todas');
    setRange(NO_RANGE);
    setOpenMenu(null);
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

  const countLabel = `${filtered.length} ${filtered.length === 1 ? 'cotización' : 'cotizaciones'}`;

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
        <section className="hi-card" aria-label="Historial de cotizaciones">
          <div className="hi-toolbar">
            <label className="hi-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                data-testid="hi-search"
                aria-label="Buscar por folio, cliente o vehículo"
                placeholder="Buscar por folio, cliente o vehículo"
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
                  {filtered.map((quotation, index) => {
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
                        <td className="hi-date">{formatDate(quotation.createdAt)}</td>
                        <td className="hi-client">{quotation.customer.name}</td>
                        <td className="hi-vehicle">{quotation.vehicle.make} {quotation.vehicle.model}</td>
                        <td><span className="hi-badge" data-status={quotation.status} data-testid="hi-badge"><i aria-hidden="true" />{quotation.status}</span></td>
                        <td className="hi-right hi-total">{formatTotal(total)}</td>
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

          {!isLoading && filtered.length === 0 && (
            <div className="hi-empty" data-testid="hi-empty">
              <span className="hi-empty-icon" aria-hidden="true"><Search size={22} /></span>
              {quotations.length === 0 ? (
                <>
                  <strong>Aún no hay cotizaciones</strong>
                  <p>Crea la primera con «Nueva cotización».</p>
                </>
              ) : (
                <>
                  <strong>Sin resultados</strong>
                  <p>No hay cotizaciones con esos filtros.</p>
                  <button type="button" className="hi-btn hi-btn--secondary" data-testid="hi-empty-clear" onClick={clearFilters}>Limpiar filtros</button>
                </>
              )}
            </div>
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

