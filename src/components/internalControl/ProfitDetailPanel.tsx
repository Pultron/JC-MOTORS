import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, LockKeyhole, Plus, Trash2 } from 'lucide-react';
import { Button } from '../Button';
import { ConfirmDialog } from '../ConfirmDialog';
import type { Quotation } from '../../models/quotation';
import type { InternalCostRecord } from '../../models/internalCosts';
import { calculateProfit } from '../../services/profitCalculationService';
import type { QuoteProfit } from '../../services/profitCalculationService';
import { internalCostsStorageService } from '../../services/internalCostsStorageService';
import { createId } from '../../utils/quotation';
import { formatCents, parseCents } from '../../utils/currencyUtils';
import { profitColor, vehicleLabel } from './ProfitOverview';

interface ExpenseDraft { id: string; description: string; amount: string }
interface Draft { costs: Record<string, string>; expenses: ExpenseDraft[] }

function initialDraft(quote: Quotation, record?: InternalCostRecord): Draft {
  return {
    costs: Object.fromEntries(quote.items.filter(i => i.type === 'part').map(i => {
      const cost = record?.itemCosts.find(c => c.quoteItemId === i.id)?.actualUnitCostCents;
      return [i.id, cost == null ? '' : (cost / 100).toFixed(2)];
    })),
    expenses: record ? record.additionalExpenses.map(e => ({ id: e.id, description: e.description, amount: (e.amountCents / 100).toFixed(2) }))
      : ['Envío / traslado', 'Otros gastos'].map(description => ({ id: createId(), description, amount: '0.00' })),
  };
}

export function ProfitDetailPanel({ quote, record, onSaved, onClose, onDirty, onBusy }: {
  quote: Quotation; record?: InternalCostRecord; onSaved: (record: InternalCostRecord) => void;
  onClose: () => void; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => initialDraft(quote, record));
  const baseline = useRef(JSON.stringify(draft));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [deleting, setDeleting] = useState<string>();
  const dirty = JSON.stringify(draft) !== baseline.current;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

  const preview = useMemo(() => {
    const errors: string[] = [];
    const parse = (value: string) => { try { return parseCents(value); } catch (e) { errors.push((e as Error).message); return null; } };
    const current: InternalCostRecord = {
      id: record?.id ?? quote.id, quoteId: quote.id, createdAt: record?.createdAt ?? '', updatedAt: record?.updatedAt ?? '',
      itemCosts: Object.entries(draft.costs).map(([quoteItemId, value]) => ({ quoteItemId, actualUnitCostCents: parse(value) })),
      additionalExpenses: draft.expenses.flatMap(e => {
        const amount = parse(e.amount);
        if (amount === null) {
          if (e.description.trim()) errors.push('Captura el importe de cada gasto o elimina la fila.');
          return [];
        }
        if (!e.description.trim()) errors.push('Escribe una descripción para cada gasto con importe.');
        return [{ id: e.id, description: e.description.trim(), amountCents: amount }];
      }),
    };
    try { return { current, totals: calculateProfit(quote, current), error: errors[0] }; }
    catch (e) { return { current, totals: calculateProfit(quote), error: (e as Error).message }; }
  }, [draft, quote, record]);

  async function save() {
    if (savingRef.current || preview.error) return;
    savingRef.current = true; setSaving(true); onBusy(true); setError('');
    try {
      const saved = await internalCostsStorageService.save(preview.current);
      const next = initialDraft(quote, saved);
      baseline.current = JSON.stringify(next); setDraft(next); onDirty(false); onSaved(saved);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron guardar los gastos. Intenta de nuevo.'); }
    finally { savingRef.current = false; setSaving(false); onBusy(false); }
  }

  function removeExpense(id: string) { setDraft(current => ({ ...current, expenses: current.expenses.filter(e => e.id !== id) })); setDeleting(undefined); }

  return <aside className="profit-card profit-detail" aria-label="Detalle de ganancia">
    <h2><span className="profit-icon"><FileText size={23} /></span>Detalle de ganancia</h2>
    <div className="profit-detail-customer"><h3>{quote.folio} · {quote.customer.name}</h3><p>{vehicleLabel(quote)}</p></div>
    <p className="profit-private"><LockKeyhole size={17} /><span>Esta información es interna y no aparece en la cotización del cliente.</span></p>
    <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <fieldset disabled={saving}>
        <div className="profit-items-scroll"><table className="profit-items"><thead><tr><th scope="col">Concepto</th><th scope="col">Precio al cliente</th><th scope="col">Costo pagado</th><th scope="col">Ganancia</th></tr></thead>
          <tbody>{preview.totals.items.map(item => <InternalItemCostRow key={item.id} item={item} value={draft.costs[item.id]} onChange={value => setDraft(current => ({ ...current, costs: { ...current.costs, [item.id]: value } }))} />)}</tbody>
        </table></div>
        {preview.totals.items.length === 0 && <p className="profit-help">Esta cotización no incluye refacciones. Puedes registrar servicios externos en Otros costos.</p>}
        <AdditionalExpensesSection expenses={draft.expenses} onChange={expenses => setDraft(current => ({ ...current, expenses }))} onRemove={id => record?.additionalExpenses.some(e => e.id === id) ? setDeleting(id) : removeExpense(id)} />
      </fieldset>
      <ProfitTotals totals={preview.totals} />
      <p className="profit-help">Importes antes de IVA.{preview.totals.status !== 'complete' ? ' La ganancia es provisional: faltan costos por capturar.' : ''}</p>
      {dirty && <p className="profit-unsaved" role="status">Cambios sin guardar</p>}
      {(error || preview.error) && <p className="profit-error" role="alert">{error || preview.error}</p>}
      <div className="profit-detail-actions"><Button type="submit" variant="primary" className="profit-primary" disabled={saving || Boolean(preview.error)}>{saving ? 'Guardando…' : 'Guardar gastos'}</Button><Button type="button" className="profit-outline" disabled={saving} onClick={onClose}>Cerrar</Button></div>
    </form>
    <ConfirmDialog isOpen={Boolean(deleting)} title="Eliminar gasto guardado" description="Se quitará este gasto del detalle. Guarda los cambios para confirmar la eliminación." confirmLabel="Eliminar gasto" tone="danger" onClose={() => setDeleting(undefined)} onConfirm={() => deleting && removeExpense(deleting)} />
  </aside>;
}

function MoneyInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [focused, setFocused] = useState(false);
  let cents: number | null = null;
  let invalid = false;
  try { cents = parseCents(value); } catch { invalid = true; }
  return <input aria-label={label} aria-invalid={invalid} inputMode="decimal" type="text" placeholder="$0.00" value={focused || invalid || cents === null ? value : formatCents(cents)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={e => onChange(e.target.value)} />;
}

export function InternalItemCostRow({ item, value, onChange }: { item: QuoteProfit['items'][number]; value: string; onChange: (value: string) => void }) {
  return <tr><td>{item.description}{item.quantity !== 1 && <small>{item.quantity} unidades · costo por unidad</small>}</td><td>{formatCents(item.customerTotalCents)}</td><td><MoneyInput value={value} onChange={onChange} label={`Costo pagado por unidad: ${item.description}`} />{item.quantity !== 1 && item.actualTotalCostCents !== null && <small>Total: {formatCents(item.actualTotalCostCents)}</small>}</td><td className={item.profitCents === null ? '' : profitColor(item.profitCents)}>{item.profitCents === null ? '—' : formatCents(item.profitCents)}</td></tr>;
}

export function AdditionalExpensesSection({ expenses, onChange, onRemove }: { expenses: ExpenseDraft[]; onChange: (expenses: ExpenseDraft[]) => void; onRemove: (id: string) => void }) {
  const update = (id: string, changes: Partial<ExpenseDraft>) => onChange(expenses.map(e => e.id === id ? { ...e, ...changes } : e));
  return <section className="profit-expenses"><h3>Otros costos</h3>
    {expenses.length > 0 && <div className="profit-expense-head"><span>Descripción</span><span>Importe</span></div>}
    {expenses.map((expense, i) => <div className="profit-expense-row" key={expense.id}>
      <input aria-label={`Descripción del gasto ${i + 1}`} placeholder="Nombre del gasto" value={expense.description} onChange={e => update(expense.id, { description: e.target.value })} />
      <MoneyInput label={`Importe de ${expense.description || `gasto ${i + 1}`}`} value={expense.amount} onChange={amount => update(expense.id, { amount })} />
      <button type="button" aria-label={`Eliminar ${expense.description || `gasto ${i + 1}`}`} onClick={() => onRemove(expense.id)}><Trash2 size={17} /></button>
    </div>)}
    <button className="profit-add" type="button" onClick={() => onChange([...expenses, { id: createId(), description: '', amount: '' }])}><Plus size={17} />Agregar gasto</button>
  </section>;
}

export function ProfitTotals({ totals }: { totals: QuoteProfit }) {
  return <dl className="profit-totals"><div><dt>Total vendido</dt><dd>{formatCents(totals.soldTotalCents)}</dd></div><div><dt>Total gastado</dt><dd>{formatCents(totals.spentTotalCents)}</dd></div><div className="profit-total-result"><dt>Ganancia obtenida</dt><dd className={profitColor(totals.profitCents)}>{formatCents(totals.profitCents)}</dd></div><div><dt>Margen</dt><dd className={profitColor(totals.profitCents)}>{totals.marginPercentage.toFixed(1)}%</dd></div></dl>;
}
