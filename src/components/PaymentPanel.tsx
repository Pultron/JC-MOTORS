import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Wallet } from 'lucide-react';
import type { InternalCostRecord } from '../models/internalCosts';
import type { PaymentMethod, PaymentStatus, Quotation } from '../models/quotation';
import { internalCostsStorageService } from '../services/internalCostsStorageService';
import { formatCents, parseCents, toCents } from '../utils/currencyUtils';
import { calculateQuotationTotals, createId } from '../utils/quotation';
import { localDate } from '../utils/dateRangeUtils';
import { SectionCard } from './SectionCard';

const methodLabels: Record<PaymentMethod, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro',
};

export function PaymentPanel({ quotation }: { quotation: Quotation }) {
  const [record, setRecord] = useState<InternalCostRecord | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [date, setDate] = useState(() => localDate(new Date()));
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const total = toCents(calculateQuotationTotals(
    quotation.items, quotation.laborDiscountType, quotation.laborDiscountValue, quotation.includeVat,
  ).total);

  useEffect(() => {
    let active = true;
    internalCostsStorageService.list().then((records) => {
      if (active) setRecord(records.find((item) => item.quoteId === quotation.id) ?? null);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los pagos.');
    });
    return () => { active = false; };
  }, [quotation.id]);

  const received = record?.payments.reduce((sum, payment) => sum + payment.amountCents, 0) ?? 0;
  const balance = Math.max(0, total - received);
  const paymentStatus: PaymentStatus = received <= 0 ? 'pending' : received >= total ? 'paid' : 'partial';
  const paymentLabel: Record<PaymentStatus, string> = {
    pending: 'Pendiente de pago', partial: 'Anticipo recibido', paid: 'Pagada',
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setNotice('');
    try {
      const amountCents = parseCents(amount);
      if (amountCents === null || amountCents <= 0) throw new Error('Escribe un importe mayor que cero.');
      if (!date) throw new Error('Selecciona la fecha del pago.');
      setBusy(true);
      const saved = await internalCostsStorageService.addPayment(quotation.id, {
        id: createId(), amountCents, method, date, reference: reference.trim(),
      }, total);
      setRecord(saved);
      setAmount(''); setReference('');
      setNotice('Pago registrado correctamente.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el pago.');
    } finally {
      setBusy(false);
    }
  }

  return <SectionCard title="Pagos y anticipos" description="Registro interno; estos datos no aparecen en el PDF del cliente." icon={<Wallet size={20} />} className="print:hidden">
    <div className="mb-5 grid gap-3 text-sm sm:grid-cols-3">
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">Total</p><strong>{formatCents(total)}</strong></div>
      <div className="rounded-xl bg-emerald-50 p-3"><p className="text-emerald-700">Recibido</p><strong>{formatCents(received)}</strong></div>
      <div className="rounded-xl bg-orange-50 p-3"><p className="text-orange-700">Saldo</p><strong>{formatCents(balance)}</strong></div>
    </div>
    <p className="mb-4 text-sm font-semibold text-navy-900">Estado: {paymentLabel[paymentStatus]}</p>
    {record?.payments.length ? <div className="mb-5 overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="pb-2">Fecha</th><th className="pb-2">Método</th><th className="pb-2">Referencia</th><th className="pb-2 text-right">Importe</th></tr></thead><tbody>{record.payments.map((payment) => <tr key={payment.id} className="border-b border-slate-100"><td className="py-2">{payment.date}</td><td>{methodLabels[payment.method]}</td><td>{payment.reference || '—'}</td><td className="text-right font-semibold">{formatCents(payment.amountCents)}</td></tr>)}</tbody></table></div> : null}
    {balance > 0 && <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Importe (MXN)<input className="form-input mt-1" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" required /></label>
      <label className="text-sm">Método<select className="form-input mt-1" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{Object.entries(methodLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-sm">Fecha<input className="form-input mt-1" type="date" value={date} max={localDate(new Date())} onChange={(event) => setDate(event.target.value)} required /></label>
      <label className="text-sm">Referencia u observación<input className="form-input mt-1" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} placeholder="Opcional" /></label>
      <button className="h-11 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 sm:col-span-2" disabled={busy} type="submit">{busy ? 'Guardando…' : 'Registrar pago'}</button>
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
  </SectionCard>;
}
