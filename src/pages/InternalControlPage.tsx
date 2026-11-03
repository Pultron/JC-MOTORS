import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, LoaderCircle } from 'lucide-react';
import { useParams } from 'react-router';
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
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'No se pudo cargar la información interna.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const currentUrl = window.location.href;
    const historyNavigation = (event: PopStateEvent) => {
      if (window.location.href === currentUrl) return;
      const destination = window.location.href;
      event.stopImmediatePropagation();
      window.history.pushState(null, '', currentUrl);
      guard(() => { window.location.href = destination; });
    };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a');
      if (!anchor || anchor.href === location.href || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      guard(() => { window.location.href = anchor.href; });
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', historyNavigation, true);
    document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('popstate', historyNavigation, true); document.removeEventListener('click', navigate, true); };
  }, [dirty, busy, guard]);

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

  const clearSelection = () => { setSelectedId(undefined); setDirty(false); };
  return <div className="profit-page">
    <div className="profit-heading"><div className="profit-title"><p className="profit-eyebrow">Rentabilidad</p><h1>Control de ganancias</h1><p className="profit-subtitle">Registra los costos reales y conoce la utilidad de cada cotización.</p></div>
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
