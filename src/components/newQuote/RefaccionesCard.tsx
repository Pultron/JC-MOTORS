import { useRef } from 'react';
import { Package, Plus, Trash2 } from 'lucide-react';
import type { QuoteDraftItem, QuoteFormData } from '../../models/quoteDraft';
import { CONCEPT_LIMIT_MESSAGE, conceptCounterLevel } from '../../utils/conceptLimit';
import { parseDecimal, sanitizeDecimalInput } from '../../utils/currency';
import { formatMoney } from '../../utils/money';
import { roundCurrency } from '../../utils/quotation';
import { MAX_CONCEPTS } from '../../services/quotationLayout';
import { SuggestionInput } from '../ui/SuggestionInput';
import { FieldError } from '../ui/FieldError';
import { Card } from './primitives/Card';
import { CardHeader } from './primitives/CardHeader';

interface Props {
  form: QuoteFormData;
  errors: Record<string, string>;
  suggestions: string[];
  totalParts: number;
  onAdd: (description?: string) => void;
  onUpdate: (id: string, key: keyof Omit<QuoteDraftItem, 'id' | 'type'>, value: string) => void;
  onBlurItem: (id: string, key: 'quantity' | 'unitPrice') => void;
  onDelete: (id: string) => void;
}

export function RefaccionesCard({ form, errors, suggestions, totalParts, onAdd, onUpdate, onBlurItem, onDelete }: Props) {
  // Solo las filas agregadas después del primer render se animan al entrar.
  const initialIds = useRef(new Set(form.items.map((item) => item.id)));
  const atLimit = form.items.length >= MAX_CONCEPTS;
  return <Card delayMs={70} className="@container">
    <CardHeader icon={<Package size={18} />} title="Refacciones y materiales" subtitle="Agrega las refacciones y materiales a cotizar." trailing={<span data-testid="contador-conceptos" data-level={conceptCounterLevel(form.items.length)} className="mac-concept-counter" aria-live="polite">Conceptos {form.items.length}/{MAX_CONCEPTS}</span>} />
    <div aria-hidden="true" className="hidden items-center gap-2 border-t border-mac-separator bg-mac-header-cols px-4 py-2 text-xs font-medium text-mac-ink-2 @[640px]:flex">
      <span className="min-w-0 flex-[1_1_220px]">Descripción</span>
      <span className="w-[72px]">Cantidad</span>
      <span className="w-[120px]">Precio unitario</span>
      <span className="w-[112px] text-right">Importe</span>
      <span className="w-11" />
    </div>
    {form.items.map((item, index) => {
      const rowId = `item-${item.id}`;
      const descError = errors[`item-${item.id}-description`];
      const qtyError = errors[`item-${item.id}-quantity`];
      const priceError = errors[`item-${item.id}-unitPrice`];
      const zeroPrice = item.unitPrice.trim() !== '' && parseDecimal(item.unitPrice) === 0;
      const amount = roundCurrency(parseDecimal(item.quantity) * parseDecimal(item.unitPrice));
      return <div key={item.id} data-testid={`refaccion-fila-${index}`} className={`border-t border-mac-separator px-4 py-2 ${initialIds.current.has(item.id) ? '' : 'animate-row-in'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <SuggestionInput data-testid={`refaccion-descripcion-${index}`} aria-label={`Descripción de la refacción ${index + 1}`} aria-invalid={Boolean(descError)} aria-describedby={descError ? `${rowId}-description-error` : undefined} className="mac-fill-input min-w-0 flex-[1_1_220px]" value={item.description} suggestions={suggestions} onChange={(value) => onUpdate(item.id, 'description', value)} placeholder="Descripción de la refacción o material" />
          <input data-testid={`refaccion-cantidad-${index}`} aria-label={`Cantidad de la refacción ${index + 1}`} aria-invalid={Boolean(qtyError)} aria-describedby={qtyError ? `${rowId}-quantity-error` : undefined} onBlur={() => onBlurItem(item.id, 'quantity')} className="mac-fill-input w-[72px] tnum" type="number" min="1" step="1" value={item.quantity} onChange={(event) => onUpdate(item.id, 'quantity', event.target.value)} />
          <input data-testid={`refaccion-precio-${index}`} aria-label={`Precio unitario de la refacción ${index + 1}`} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? `${rowId}-unitPrice-error` : undefined} onBlur={() => onBlurItem(item.id, 'unitPrice')} className="mac-fill-input w-[120px] tnum" inputMode="decimal" value={item.unitPrice} onChange={(event) => onUpdate(item.id, 'unitPrice', sanitizeDecimalInput(event.target.value))} placeholder="0.00" />
          <output aria-label={`Importe de la refacción ${index + 1}`} data-testid={`refaccion-importe-${index}`} className="tnum w-[112px] text-right text-sm font-medium">{formatMoney(amount)}</output>
          <button type="button" data-testid={`refaccion-eliminar-${index}`} aria-label={`Eliminar refacción ${index + 1}`} className="mac-press flex size-11 items-center justify-center rounded-lg text-mac-ink-2 hover:bg-mac-fill hover:text-mac-danger" onClick={() => onDelete(item.id)}><Trash2 size={17} aria-hidden="true" /></button>
        </div>
        {zeroPrice && !priceError && <p data-testid={`refaccion-precio-cero-${index}`} className="mac-zero-price">Precio {formatMoney(0)}</p>}
        <FieldError id={`${rowId}-description-error`} message={descError} className="pt-1" />
        <FieldError id={`${rowId}-quantity-error`} message={qtyError} className="pt-1" />
        <FieldError id={`${rowId}-unitPrice-error`} message={priceError} className="pt-1" />
      </div>;
    })}
    {errors.items && <p role="alert" className="border-t border-mac-separator px-4 py-2 text-xs font-medium text-mac-danger">{errors.items}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-mac-separator px-4">
      <div className="flex flex-wrap items-center gap-x-3">
        <button type="button" data-testid="refaccion-agregar" disabled={atLimit} aria-describedby={atLimit ? "limite-conceptos" : undefined} className="mac-press flex h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-mac-accent-text hover:text-mac-accent-hover disabled:cursor-not-allowed disabled:opacity-50" onClick={() => onAdd()}><Plus size={16} aria-hidden="true" />Agregar refacción</button>
        {atLimit && <p id="limite-conceptos" data-testid="limite-conceptos" className="text-xs font-medium text-mac-danger">{CONCEPT_LIMIT_MESSAGE}</p>}
      </div>
      <p className="text-sm text-mac-ink-2">Total refacciones <strong data-testid="refacciones-total" className="tnum ml-1.5 font-bold text-mac-ink">{formatMoney(totalParts)}</strong></p>
    </div>
  </Card>;
}
