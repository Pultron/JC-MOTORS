import { useEffect, useRef, useState } from 'react';
import { Calculator, CircleAlert, Info, Plus, Save, Tag, Trash2, X } from 'lucide-react';
import { Button } from '../Button';
import type { QuoteFormData } from '../../models/quoteDraft';
import type { DiscountType } from '../../models/quotation';
import type { QuotationTotals } from '../../utils/quotation';
import { createId, formatCurrency } from '../../utils/quotation';

interface Promotion { id: string; name: string; type: DiscountType; value: number }
const PROMOTIONS_KEY = 'jc-motors-promotions-v1';
function loadPromotions(): Promotion[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PROMOTIONS_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is Promotion => Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && (item.type === 'fixed' || item.type === 'percentage') && Number.isFinite(item.value) && item.value > 0 && (item.type !== 'percentage' || item.value <= 100))) : [];
  } catch { return []; }
}

interface Props {
  form: QuoteFormData;
  totals: QuotationTotals;
  errors: Record<string, string>;
  busy: boolean;
  submitError: string;
  onChange: <K extends keyof QuoteFormData>(key: K, value: QuoteFormData[K]) => void;
  onSaveDraft: () => void;
  onClear: () => void;
}

export function QuoteSummary({ form, totals, errors, busy, submitError, onChange, onSaveDraft, onClear }: Props) {
  const [promotions, setPromotions] = useState<Promotion[]>(loadPromotions);
  const [selectedPromotion, setSelectedPromotion] = useState('');
  const [creating, setCreating] = useState(false);
  const [promotionName, setPromotionName] = useState('');
  const [promotionType, setPromotionType] = useState<DiscountType>('percentage');
  const [promotionValue, setPromotionValue] = useState('');
  const [promotionError, setPromotionError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const match = totals.subtotalManoObra > 0 ? promotions.find((promotion) => promotion.type === form.laborDiscountType && (promotion.type === 'fixed' ? Math.min(promotion.value, totals.subtotalManoObra) : promotion.value) === Number(form.laborDiscountValue)) : undefined;
    setSelectedPromotion(match?.id ?? '');
  }, [form.laborDiscountType, form.laborDiscountValue, promotions, totals.subtotalManoObra]);

  useEffect(() => {
    if (creating) dialog.current?.showModal();
    else dialog.current?.close();
  }, [creating]);

  function applyPromotion(id: string, promotion = promotions.find((item) => item.id === id)) {
    setSelectedPromotion(id);
    onChange('laborDiscountType', promotion?.type ?? 'percentage');
    onChange('laborDiscountValue', String(promotion && totals.subtotalManoObra > 0 ? promotion.type === 'fixed' ? Math.min(promotion.value, totals.subtotalManoObra) : promotion.value : 0));
  }

  function savePromotion() {
    const name = promotionName.trim();
    const value = Number(promotionValue);
    if (!name || !Number.isFinite(value) || value <= 0 || (promotionType === 'percentage' && value > 100)) {
      setPromotionError('Escribe un nombre y un descuento mayor que cero. El porcentaje no puede superar 100%.');
      return;
    }
    const created: Promotion = { id: createId(), name, type: promotionType, value };
    const next = [...promotions, created];
    try {
      localStorage.setItem(PROMOTIONS_KEY, JSON.stringify(next));
    } catch {
      setPromotionError('No se pudo guardar la promoción. Revisa el espacio disponible.');
      return;
    }
    setPromotions(next);
    applyPromotion(created.id, created);
    setPromotionName(''); setPromotionValue(''); setPromotionError(''); setCreating(false);
  }

  const customDiscount = !selectedPromotion && Number(form.laborDiscountValue) > 0;

  return <aside className="quote-summary">
    <section className="quote-summary-card">
      <h2 className="quote-summary-heading"><span><Calculator size={20} /></span>Resumen de cotización</h2>
      <div className="quote-summary-rows">
        <Line label="Refacciones" value={formatCurrency(totals.subtotalRefacciones)} />
        <div>
          <div className="quote-summary-line items-center">
            <label htmlFor="quote-labor">Mano de obra</label>
            <div className="quote-labor-input">
              <span aria-hidden="true">$</span>
              <input id="quote-labor" aria-invalid={Boolean(errors.laborAmount)} type="number" min="0" step="0.01" value={form.laborAmount} placeholder="0.00" onChange={(event) => { onChange('laborAmount', event.target.value); if (!Number(event.target.value)) onChange('laborDiscountValue', '0'); }} />
            </div>
          </div>
          {errors.laborAmount && <p role="alert" className="mt-1 text-right text-xs text-rose-600">{errors.laborAmount}</p>}
        </div>

        <div className="quote-promotions">
          <h3><Tag size={21} />Promociones</h3>
          <label className="quote-field-label" htmlFor="quote-promotion">Seleccionar promoción</label>
          <div className="quote-promotion-controls">
            <select id="quote-promotion" className="form-input" disabled={totals.subtotalManoObra <= 0} value={customDiscount ? '__saved' : selectedPromotion} onChange={(event) => { if (event.target.value !== '__saved') applyPromotion(event.target.value); }}>
              <option value="">Sin promoción</option>
              {customDiscount && <option value="__saved">Descuento guardado</option>}
              {promotions.map((promotion) => <option key={promotion.id} value={promotion.id}>{promotion.name}</option>)}
            </select>
            <Button type="button" variant="secondary" className="quote-create-promotion" icon={<Plus size={14} />} onClick={() => { setCreating(true); setPromotionError(''); }}>Crear promoción</Button>
          </div>
          <p className="quote-promotion-info"><Info size={15} />Las promociones se aplican únicamente a mano de obra.</p>
          {totals.laborDiscount > 0 && <p className="mt-2 text-right text-xs font-medium text-blue-700">Descuento: − {formatCurrency(totals.laborDiscount)}</p>}
          {errors.laborDiscountValue && <p role="alert" className="mt-1 text-xs text-rose-600">{errors.laborDiscountValue}</p>}
        </div>

        <div className="quote-subtotal"><Line label="Subtotal" value={formatCurrency(totals.subtotalNeto)} /></div>
        <label className="quote-summary-line cursor-pointer items-center"><span>Incluir IVA (16%)</span><input type="checkbox" className="quote-switch" checked={form.ivaEnabled} onChange={(event) => onChange('ivaEnabled', event.target.checked)} /></label>
        <Line label="IVA" value={formatCurrency(totals.ivaAmount)} />
        <div className="quote-total"><span>Total</span><strong>{formatCurrency(totals.total)}</strong></div>
        <p className="quote-summary-info"><Info size={16} />Los costos y descuentos internos de las refacciones no se muestran al cliente.</p>
      </div>
      {submitError && <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-rose-600"><CircleAlert size={16} />{submitError}</p>}
      <div className="quote-summary-actions">
        <Button type="button" variant="secondary" icon={<Save size={16} />} disabled={busy} onClick={onSaveDraft}>Guardar borrador</Button>
        <Button type="submit" variant="primary" disabled={busy} icon={<Save size={16} />}>{busy ? 'Guardando…' : 'Guardar cotización'}</Button>
      </div>
    </section>
    <button type="button" className="quote-clear" disabled={busy} onClick={onClear}><Trash2 size={15} />Limpiar formulario</button>

    <dialog ref={dialog} className="quote-promotion-dialog" aria-labelledby="promotion-dialog-title" onClose={() => setCreating(false)} onCancel={() => setCreating(false)} onKeyDown={(event) => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); savePromotion(); } }}>
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id="promotion-dialog-title" className="text-lg font-bold text-navy-950">Crear promoción</h2><button type="button" className="icon-button" aria-label="Cerrar promoción" onClick={() => setCreating(false)}><X size={19} /></button></div>
      <p className="mb-4 text-sm text-slate-500">El descuento se aplicará a la mano de obra.</p>
      <label className="block"><span className="quote-field-label">Nombre de la promoción</span><input autoFocus className="form-input" value={promotionName} maxLength={60} onChange={(event) => setPromotionName(event.target.value)} placeholder="Ej. Promoción de temporada" /></label>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label><span className="quote-field-label">Tipo de descuento</span><select className="form-input" value={promotionType} onChange={(event) => setPromotionType(event.target.value as DiscountType)}><option value="percentage">Porcentaje (%)</option><option value="fixed">Monto (MXN)</option></select></label>
        <label><span className="quote-field-label">Descuento</span><input className="form-input" type="number" min="0.01" max={promotionType === 'percentage' ? 100 : undefined} step="0.01" value={promotionValue} onChange={(event) => setPromotionValue(event.target.value)} placeholder="0.00" /></label>
      </div>
      {promotionError && <p role="alert" className="mt-3 text-sm text-rose-600">{promotionError}</p>}
      <div className="mt-5 flex justify-end gap-2"><Button type="button" onClick={() => setCreating(false)}>Cancelar</Button><Button type="button" variant="primary" onClick={savePromotion}>Guardar promoción</Button></div>
    </dialog>
  </aside>;
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="quote-summary-line"><span>{label}</span><strong>{value}</strong></div>;
}
