import { Calculator, Info, Save, Tag, Trash2 } from 'lucide-react';
import type { QuoteFormData } from '../../models/quoteDraft';
import type { QuotationTotals } from '../../utils/quotation';
import { formatMoney, sanitizeDecimalInput } from '../../utils/currency';
import { Select } from '../ui/Select';
import { Card } from './primitives/Card';
import { CardHeader } from './primitives/CardHeader';
import { Switch } from './primitives/Switch';

interface Props {
  form: QuoteFormData;
  totals: QuotationTotals;
  errors: Record<string, string>;
  busy: boolean;
  onChange: <K extends keyof QuoteFormData>(key: K, value: QuoteFormData[K]) => void;
  onLaborChange: (value: string) => void;
  onSaveDraft?: () => void;
  onClear?: () => void;
  submitLabel?: string;
}

const rowClass = 'flex min-h-11 items-center justify-between gap-3 border-t border-mac-separator px-4 text-sm';

const SAVED_DISCOUNT = '__saved';
const PROMOTION_OPTIONS = [
  { value: '0', label: 'Sin promoción' },
  { value: '5', label: '5% de descuento' },
  { value: '10', label: '10% de descuento' },
  { value: '15', label: '15% de descuento' },
];

export function ResumenCard({ form, totals, errors, busy, onChange, onLaborChange, onSaveDraft, onClear, submitLabel = 'Guardar cotización' }: Props) {
  const discountValue = Number(form.laborDiscountValue) || 0;
  const promotionValue = form.laborDiscountType === 'percentage' && PROMOTION_OPTIONS.some((option) => Number(option.value) === discountValue)
    ? String(discountValue)
    : discountValue > 0 ? SAVED_DISCOUNT : '0';

  function applyPromotion(value: string) {
    onChange('laborDiscountType', 'percentage');
    onChange('laborDiscountValue', value);
  }

  return <aside className="min-w-0 flex-[1_1_340px] lg:max-w-[400px]">
    <Card delayMs={70}>
      <CardHeader icon={<Calculator size={18} />} title="Resumen de cotización" />
      <div className="tnum">
        <div className={rowClass}><span className="text-mac-ink-2">Refacciones</span><strong data-testid="resumen-refacciones" className="font-semibold">{formatMoney(totals.subtotalRefacciones)}</strong></div>
        <div className={rowClass}>
          <label htmlFor="quote-labor" className="text-mac-ink-2">Mano de obra</label>
          <div className="flex h-9 w-40 items-center rounded-lg bg-mac-fill transition-[box-shadow] duration-[180ms] focus-within:outline focus-within:outline-2 focus-within:outline-mac-accent">
            <span aria-hidden="true" className="pl-3 text-mac-ink-2">$</span>
            <input id="quote-labor" data-testid="resumen-mano-obra" inputMode="decimal" aria-invalid={Boolean(errors.laborAmount)} className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-right text-sm outline-none focus-visible:!outline-none" value={form.laborAmount} placeholder="0.00" onChange={(event) => onLaborChange(sanitizeDecimalInput(event.target.value))} />
          </div>
        </div>
        {errors.laborAmount && <p role="alert" className="px-4 pb-2 text-right text-xs font-medium text-mac-danger">{errors.laborAmount}</p>}

        <div className="mx-4 mb-3.5 mt-2 rounded-xl bg-mac-tint-promo p-3.5">
          <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-mac-ink"><Tag size={16} aria-hidden="true" className="text-mac-accent-text" />Promociones</h3>
          <div className="flex flex-wrap gap-2">
            <Select testId="resumen-promocion" ariaLabel="Seleccionar promoción" className="mac-press h-9 w-full rounded-lg border-0 bg-white px-2.5 text-sm shadow-[0_0_0_1px_rgb(0_0_0/0.1)]" value={promotionValue}
              onChange={(value) => { if (value !== SAVED_DISCOUNT) applyPromotion(value); }}
              options={[...PROMOTION_OPTIONS, ...(promotionValue === SAVED_DISCOUNT ? [{ value: SAVED_DISCOUNT, label: 'Descuento guardado' }] : [])]} />
          </div>
          <p className="mt-2.5 flex items-start gap-1.5 text-xs leading-snug text-mac-accent-text"><Info size={14} aria-hidden="true" className="mt-px flex-none" />Las promociones se aplican únicamente a mano de obra.</p>
          {errors.laborDiscountValue && <p role="alert" className="mt-1 text-xs font-medium text-mac-danger">{errors.laborDiscountValue}</p>}
        </div>

        {totals.laborDiscount > 0 && <div className={rowClass}><span className="text-mac-success">Descuento</span><strong data-testid="resumen-descuento" className="font-semibold text-mac-success">− {formatMoney(totals.laborDiscount)}</strong></div>}
        <div className={rowClass}><span className="text-mac-ink-2">Subtotal</span><strong data-testid="resumen-subtotal" className="font-semibold">{formatMoney(totals.subtotalNeto)}</strong></div>
        <div className={`${rowClass} !pr-1`}><span className="text-mac-ink">Incluir IVA (16%)</span><Switch checked={form.ivaEnabled} onChange={(checked) => onChange('ivaEnabled', checked)} label="Incluir IVA (16%)" testId="resumen-iva-switch" /></div>
        <div className={rowClass}><span className="text-mac-ink-2">IVA</span><strong data-testid="resumen-iva" className="font-semibold">{formatMoney(totals.ivaAmount)}</strong></div>

        <div className="mx-4 mb-4 mt-2 flex items-center justify-between gap-3 rounded-xl bg-mac-tint p-4">
          <span className="font-semibold text-mac-accent-text">Total</span>
          <strong data-testid="resumen-total" className="text-[28px] font-bold leading-none tracking-[-0.02em] text-mac-accent">{formatMoney(totals.total)}</strong>
        </div>
        <p className="mx-4 mb-4 flex items-start gap-2 rounded-xl bg-mac-info-bg p-3 text-xs leading-snug text-mac-info-text"><Info size={15} aria-hidden="true" className="mt-px flex-none" />Los costos y descuentos internos de las refacciones no se muestran al cliente.</p>
      </div>
      <div className="grid gap-2 px-4 pb-4">
        {onSaveDraft && <button type="button" data-testid="guardar-borrador" disabled={busy} className="mac-press flex h-11 items-center justify-center gap-2 rounded-[10px] bg-white text-sm font-semibold shadow-[0_0_0_1px_rgb(0_0_0/0.12)] hover:bg-mac-header-cols disabled:opacity-50" onClick={onSaveDraft}><Save size={16} aria-hidden="true" />Guardar borrador</button>}
        <button type="submit" data-testid="guardar-cotizacion" disabled={busy} className="mac-press flex h-11 items-center justify-center gap-2 rounded-[10px] bg-mac-accent text-sm font-semibold text-white shadow-[0_1px_2px_rgb(120_40_0/0.35),inset_0_1px_0_rgb(255_255_255/0.18)] hover:bg-mac-accent-hover disabled:opacity-50"><Save size={16} aria-hidden="true" />{busy ? 'Guardando…' : submitLabel}</button>
      </div>
    </Card>
    {onClear && <button type="button" data-testid="limpiar-formulario" disabled={busy} className="mac-press mx-auto mt-3 flex h-11 items-center gap-2 rounded-lg px-3 text-sm text-mac-ink-2 hover:text-mac-danger disabled:opacity-50" onClick={onClear}><Trash2 size={16} aria-hidden="true" />Limpiar formulario</button>}

  </aside>;
}
