import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shouldBlockNavigation } from '../services/workshopForm';
import { FileText, LoaderCircle } from 'lucide-react';
import { useBlocker, useParams } from 'react-router';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../hooks/useConfirm';
import { PeriodFilter, ProfitSummaryCards, QuoteProfitabilityTable } from '../components/internalControl/ProfitOverview';
import { ProfitDetailPanel } from '../components/internalControl/ProfitDetailPanel';
import type { InternalCostRecord } from '../models/internalCosts';
import { internalCostsStorageService } from '../services/internalCostsStorageService';
import { calculateProfit } from '../services/profitCalculationService';
import { useQuotations } from '../store/QuotationContext';
import { isInRange, periodRange } from '../utils/dateRangeUtils';
import type { DateRange, Period } from '../utils/dateRangeUtils';
import './internalControl.css';
import { userMessage } from '../utils/userMessage';

export function InternalControlPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { quotations, isLoading } = useQuotations();
  const { quotationId } = useParams();
  const [records, setRecords] = useState<InternalCostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [period, setPeriod] = useState<Period>('month');
  const [range, setRange] = useState<DateRange>(() => periodRange('month'));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState<string | undefined>(quotationId);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const guard = useCallback((action: () => void) => {
    if (busy) return;
    if (!dirty) { action(); return; }
    void confirm({ title: 'Cambios sin guardar', description: 'Hay gastos que todavía no has guardado. ¿Quieres descartarlos y continuar?', confirmLabel: 'Descartar cambios', tone: 'danger' })
      .then(accepted => { if (!accepted) return; setDirty(false); action(); });
  }, [dirty, busy, confirm]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    internalCostsStorageService.list().then(result => { if (active) setRecords(result); })
      .catch(e => { if (active) setError(userMessage(e, 'gastos-cargar')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, busy]);

  // Router-level navigation guard: no manual history/click interception.
  const guardRef = useRef({ dirty, busy });
  guardRef.current = { dirty, busy };
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (guardRef.current.dirty || guardRef.current.busy) && shouldBlockNavigation(true, currentLocation, nextLocation));
  const askingRef = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || askingRef.current) return;
    if (guardRef.current.busy) { blocker.reset(); return; }
    askingRef.current = true;
    void confirm({ title: 'Cambios sin guardar', description: 'Hay gastos que todavía no has guardado. ¿Quieres descartarlos y continuar?', confirmLabel: 'Descartar cambios', tone: 'danger' })
      .catch(() => false)
      .then(accepted => { askingRef.current = false; if (accepted) blocker.proceed(); else blocker.reset(); });
    // The prompt reads everything through refs, so only the blocker state drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);

  const recordMap = useMemo(() => new Map(records.map(r => [r.quoteId, r])), [records]);
  const periodRows = useMemo(() => quotations.filter(q => isInRange(q, range))
    .sort((a, b) => (b.approvedAt ?? b.createdAt).localeCompare(a.approvedAt ?? a.createdAt))
    .map(quote => ({ quote, totals: calculateProfit(quote, recordMap.get(quote.id)) })), [quotations, range, recordMap]);
  const rows = useMemo(() => {
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const term = normalize(search.trim());
    return periodRows.filter(({ quote, totals }) => (status === 'all' || totals.status === status)
      && normalize([quote.folio, quote.customer.name, quote.vehicle.make, quote.vehicle.model, quote.vehicle.year, quote.vehicle.plates].join(' ')).includes(term));
  }, [periodRows, search, status]);
  const selected = quotations.find(q => q.id === selectedId && q.status === 'Aprobada');

  // The detail panel can unmount without reporting (quotation no longer approved,
  // list refreshed on focus). Stale dirty/busy flags would keep the navigation
  // guard active and swallow every sidebar click.
  useEffect(() => {
    if (!selected && (dirty || busy)) { setDirty(false); setBusy(false); }
  }, [selected, dirty, busy]);

  const clearSelection = () => { setSelectedId(undefined); setDirty(false); };
  return <div className="profit-page">
    <div className="profit-heading"><div className="profit-title"><h1>Control de ganancias</h1></div>
      <PeriodFilter period={period} range={range} onChange={(next, custom) => guard(() => { setPeriod(next); setRange(next === 'custom' ? custom! : periodRange(next)); clearSelection(); })} />
    </div>
    {loading || isLoading ? <div className="profit-card profit-loading" role="status"><LoaderCircle size={23} className="animate-spin" />Cargando cotizaciones y gastos…</div>
      : error ? <div className="profit-card profit-empty" role="alert"><h2>No se pudo cargar el control interno</h2><p>{error}</p><button className="profit-outline" onClick={() => setRetry(r => r + 1)}>Reintentar</button></div>
      : <><ProfitSummaryCards rows={periodRows} /><div className="profit-workspace">
        <QuoteProfitabilityTable rows={rows} selectedId={selectedId} search={search} status={status} hasQuotes={periodRows.length > 0} onSearch={setSearch} onStatus={setStatus} onSelect={quote => { if (quote.id !== selectedId) guard(() => { setSelectedId(quote.id); setDirty(false); }); }} />
        {selected ? <ProfitDetailPanel key={selected.id} quote={selected} record={recordMap.get(selected.id)} onDirty={setDirty} onBusy={setBusy} onClose={() => guard(clearSelection)} onSaved={saved => { setRecords(current => [...current.filter(r => r.quoteId !== saved.quoteId), saved]); toast.success({ title: 'Gastos guardados', description: 'Gastos guardados correctamente' }); }} />
          : <aside className="profit-card profit-detail profit-detail-empty"><span className="profit-icon"><FileText size={25} /></span><h2>Detalle de ganancia</h2><p>Selecciona una cotización para consultar su ganancia y registrar los costos reales.</p><p className="profit-help">La información se guarda únicamente en el control interno.</p></aside>}
      </div></>}
  </div>;
}
