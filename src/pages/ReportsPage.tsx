import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { InternalCostRecord } from '../models/internalCosts';
import { buildMonthlyReport } from '../services/monthlyReportService';
import { internalCostsStorageService } from '../services/internalCostsStorageService';
import { useQuotations } from '../store/QuotationContext';
import { formatCents } from '../utils/currencyUtils';
import { formatDate, getMonthKey } from '../utils/quotation';

function csvText(value: string): string {
  const safe = /^[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function ReportsPage() {
  const { quotations, isLoading } = useQuotations();
  const [month, setMonth] = useState(() => getMonthKey(new Date().toISOString()));
  const [records, setRecords] = useState<InternalCostRecord[]>([]);
  const [error, setError] = useState('');
  const [exportNotice, setExportNotice] = useState('');
  useEffect(() => {
    let active = true;
    internalCostsStorageService.list().then((items) => { if (active) setRecords(items); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron leer los costos.'); });
    return () => { active = false; };
  }, []);
  const report = useMemo(() => buildMonthlyReport(month, quotations, records), [month, quotations, records]);

  async function exportCsv() {
    setExportNotice('');
    const heading = ['Folio', 'Fecha', 'Cliente', 'Vehículo', 'Placas', 'Estado', 'Resultado', 'Venta MXN', 'Gastos MXN', 'Utilidad antes de IVA MXN', 'Cobrado MXN', 'Provisional'];
    const data = report.rows.map((row) => [
      csvText(row.quotation.folio), csvText(formatDate(row.eventAt)), csvText(row.quotation.customer.name),
      csvText(`${row.quotation.vehicle.make} ${row.quotation.vehicle.model}`), csvText(row.quotation.vehicle.plates),
      csvText(row.quotation.status), csvText(row.outcome === 'aprobada' ? 'Aprobada' : 'Perdida'),
      (row.saleCents / 100).toFixed(2), (row.spentCents / 100).toFixed(2), (row.profitCents / 100).toFixed(2),
      (row.receivedCents / 100).toFixed(2), csvText(row.provisional ? 'Sí' : 'No'),
    ].join(';'));
    const summary = [
      ['Ventas', report.salesCents], ['Gastos', report.spentCents], ['Utilidad antes de IVA', report.profitCents], ['Cobrado', report.receivedCents],
    ].map(([label, cents]) => `${csvText(String(label))};${(Number(cents) / 100).toFixed(2)}`);
    const csv = ['\uFEFF', heading.map(csvText).join(';'), '\r\n', ...data.map((row) => `${row}\r\n`), '\r\n', ...summary.map((row) => `${row}\r\n`)].join('');
    try {
      if (window.__TAURI__?.core.invoke) {
        const bytes = Array.from(new TextEncoder().encode(csv));
        const path = await window.__TAURI__.core.invoke<string>('save_monthly_report_csv', { month, bytes });
        setExportNotice(`Reporte guardado en ${path}`);
      } else {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `reporte-jc-motors-${month}.csv`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setExportNotice('Reporte descargado.');
      }
    } catch (cause) {
      setExportNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return <div>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Reportes</p><h1 className="mt-1 text-2xl font-bold text-navy-950">Resumen mensual</h1><p className="mt-1 text-sm text-slate-500">Ventas al aprobar; cancelaciones y vencimientos en el mes en que ocurrieron.</p></div>
      <div className="flex flex-wrap items-end gap-3"><label className="text-sm font-semibold text-slate-700">Mes<input className="form-input mt-1" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><button className="h-[42px] rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600" onClick={() => void exportCsv()} disabled={isLoading || Boolean(error) || !month}><span className="inline-flex items-center gap-2"><Download size={16} />Exportar CSV</span></button></div>
    </div>
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {exportNotice && <p role="status" className="mb-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-700">{exportNotice}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Ventas', formatCents(report.salesCents)],
        ['Utilidad antes de IVA', formatCents(report.profitCents)],
        ['Aprobadas', String(report.approvedCount)],
        ['Perdidas (canceladas o vencidas)', String(report.lostCount)],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-card"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-navy-950">{value}</p></div>)}
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="mb-4 flex flex-wrap justify-between gap-2"><h2 className="font-bold text-navy-950">Detalle del mes</h2><p className="text-xs text-slate-500">Cobrado: {formatCents(report.receivedCents)} · Gastos capturados: {formatCents(report.spentCents)}</p></div>
      {isLoading ? <p className="py-8 text-center text-sm text-slate-500">Cargando cotizaciones…</p>
        : report.rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No hay movimientos en este mes.</p>
          : <div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="pb-3">Fecha</th><th className="pb-3">Folio</th><th className="pb-3">Cliente</th><th className="pb-3">Estado</th><th className="pb-3 text-right">Venta</th><th className="pb-3 text-right">Utilidad</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.quotation.id} className="border-b border-slate-100"><td className="py-3">{formatDate(row.eventAt)}</td><td className="font-semibold">{row.quotation.folio}</td><td>{row.quotation.customer.name}</td><td>{row.quotation.status}</td><td className="text-right">{formatCents(row.saleCents)}</td><td className="text-right">{row.outcome === 'perdida' ? '—' : `${formatCents(row.profitCents)}${row.provisional ? ' *' : ''}`}</td></tr>)}</tbody></table></div>}
      <p className="mt-4 text-xs text-slate-500">* La utilidad es provisional mientras falten costos por capturar. Las ventas incluyen IVA cuando aplica; la utilidad se calcula antes de IVA.</p>
    </section>
  </div>;
}
