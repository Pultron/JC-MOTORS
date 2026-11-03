import { CalendarDays, ChartNoAxesColumnIncreasing, Coins, List, Search, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import type { InternalCaptureStatus } from '../../models/internalCosts';
import type { Quotation } from '../../models/quotation';
import type { QuoteProfit } from '../../services/profitCalculationService';
import { formatCents } from '../../utils/currencyUtils';
import { useCountUp } from '../../hooks/useCountUp';
import { Select } from '../ui/Select';
import { RangeCalendar } from './RangeCalendar';
import { rangeLabel } from '../../utils/dateRangeUtils';
import type { DateRange, Period } from '../../utils/dateRangeUtils';

export const captureLabels = { pending: 'Pendiente', incomplete: 'Falta capturar', complete: 'Completo' };
export interface ProfitRow { quote: Quotation; totals: QuoteProfit }

export function PeriodFilter({ period, range, onChange }: { period: Period; range: DateRange; onChange: (period: Period, range?: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="profit-period">
    <div className="profit-segments" role="group" aria-label="Periodo">
      {(['today', 'week', 'month'] as const).map((key, i) => <button key={key} type="button" aria-pressed={period === key} onClick={() => { onChange(key); setOpen(false); }}>{['Hoy', 'Semana', 'Mes'][i]}</button>)}
    </div>
    <div className="profit-range-wrap">
      <button className="profit-range-button" type="button" aria-expanded={open} onClick={() => setOpen(!open)}><CalendarDays size={18} />{rangeLabel(range)}</button>
      {open && <RangeCalendar value={range} onCancel={() => setOpen(false)} onApply={next => { onChange('custom', next); setOpen(false); }} />}
    </div>
  </div>;
}

export function ProfitSummaryCards({ rows }: { rows: ProfitRow[] }) {
  const sold = rows.reduce((sum, r) => sum + r.totals.soldTotalCents, 0);
  const spent = rows.reduce((sum, r) => sum + r.totals.spentTotalCents, 0);
  return <div className="profit-summary">
    {[
      { title: 'Total vendido', amount: sold, subtitle: `Suma de ${rows.length} cotizaciones aprobadas`, Icon: ShoppingCart },
      { title: 'Total gastado', amount: spent, subtitle: 'Refacciones, envíos y otros gastos', Icon: Coins },
      { title: 'Ganancia obtenida', amount: sold - spent, subtitle: 'Dinero restante después de gastos', Icon: ChartNoAxesColumnIncreasing },
    ].map(({ title, amount, subtitle, Icon }, i) => <section className="profit-card profit-metric profit-rise" style={{ animationDelay: `${0.07 * (i + 1)}s` }} key={title}>
      <span className={`profit-icon ${i === 2 ? 'profit-icon-green' : ''}`}><Icon size={22} /></span>
      <div><h2>{title}</h2><AnimatedAmount amount={amount} className={`profit-metric-value ${i === 2 ? profitColor(amount) : ''}`} /><p className="profit-muted">{subtitle}</p></div>
    </section>)}
  </div>;
}

function AnimatedAmount({ amount, className }: { amount: number; className: string }) {
  const shown = useCountUp(amount);
  return <p className={className} aria-label={formatCents(amount, true)}><span aria-hidden="true">{formatCents(shown, true)}</span></p>;
}

export function InternalCaptureStatusBadge({ status }: { status: InternalCaptureStatus }) {
  return <span className={`profit-badge profit-badge-${status}`}>{captureLabels[status]}</span>;
}

export function QuoteProfitabilityTable({ rows, selectedId, search, status, onSearch, onStatus, onSelect, hasQuotes }: {
  rows: ProfitRow[]; selectedId?: string; search: string; status: string; hasQuotes: boolean;
  onSearch: (value: string) => void; onStatus: (value: string) => void; onSelect: (quote: Quotation) => void;
}) {
  return <section className="profit-card profit-table-card profit-rise" style={{ animationDelay: '.14s' }}>
    <div className="profit-table-toolbar"><h2><span className="profit-icon"><List size={22} /></span>Rentabilidad por cotización</h2>
      <div className="profit-table-filters"><label className="profit-search"><span>Buscar cotización</span><div><Search size={17} /><input placeholder="Buscar folio, cliente o vehículo" value={search} onChange={e => onSearch(e.target.value)} /></div></label>
        <div className="profit-status-filter"><label htmlFor="profit-status-select"><span>Estado de captura</span></label><Select id="profit-status-select" className="profit-select" value={status} onChange={onStatus} options={[{ value: 'all', label: 'Todas' }, ...Object.entries(captureLabels).map(([key, label]) => ({ value: key, label }))]} /></div>
      </div>
    </div>
    <div className="profit-table-scroll"><table className="profit-table"><thead><tr>{['Folio', 'Cliente / vehículo', 'Vendido', 'Gastado', 'Ganancia', 'Margen', 'Estado', 'Acción'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map(({ quote, totals }) => <tr key={quote.id} className={selectedId === quote.id ? 'is-selected' : ''} onClick={() => onSelect(quote)}>
        <td className="profit-folio">{quote.folio}</td><td><strong>{quote.customer.name}</strong><span className="profit-vehicle">{vehicleLabel(quote)}</span></td>
        <td>{formatCents(totals.soldTotalCents)}</td><td>{totals.status === 'pending' ? '—' : formatCents(totals.spentTotalCents)}</td>
        <td className={totals.status === 'pending' ? '' : profitColor(totals.profitCents)}>{totals.status === 'pending' ? '—' : formatCents(totals.profitCents)}</td>
        <td>{totals.status === 'pending' ? '—' : `${totals.marginPercentage.toFixed(1)}%`}</td><td><InternalCaptureStatusBadge status={totals.status} /></td>
        <td><button className="profit-outline" aria-label={`${totals.status === 'complete' ? 'Ver detalle' : 'Capturar'} ${quote.folio}`} onClick={e => { e.stopPropagation(); onSelect(quote); }}>{totals.status === 'complete' ? 'Ver detalle' : 'Capturar'}</button></td>
      </tr>)}</tbody>
    </table></div>
    {rows.length === 0 && <div className="profit-empty"><List size={30} /><h3>{hasQuotes ? 'Sin resultados de búsqueda' : 'No hay cotizaciones aprobadas en este periodo'}</h3><p>{hasQuotes ? 'Prueba con otro cliente, folio o estado de captura.' : 'Selecciona otro periodo o aprueba una cotización para registrar sus costos.'}</p></div>}
  </section>;
}

export function profitColor(amount: number) { return amount < 0 ? 'profit-negative' : 'profit-positive'; }
export function vehicleLabel(quote: Quotation) { return [quote.vehicle.make, quote.vehicle.model, quote.vehicle.year].filter(Boolean).join(' '); }
