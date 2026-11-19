import { useRef } from 'react';
import { CornerDownRight, Plus, Trash2, Wrench, X } from 'lucide-react';
import type { QuoteDraftItem, QuoteFormData } from '../../models/quoteDraft';
import { CONCEPT_LIMIT_MESSAGE, conceptCounterLevel } from '../../utils/conceptLimit';
import { parseDecimal } from '../../utils/currency';
import { amountValue, sanitizeMoneyInput } from '../../validation/fields';
import { formatMoney } from '../../utils/money';
import { roundCurrency } from '../../utils/quotation';
import { MAX_CONCEPTS } from '../../services/quotationLayout';
import { LABOR_DESCRIPTION, laborOf } from '../../services/quoteLaborRows';
import { SuggestionInput } from '../ui/SuggestionInput';
import { FieldError } from '../ui/FieldError';
import type { QuoteTemplate } from '../../services/quoteTemplateService';
import { TemplatesMenu } from './TemplatesMenu';
import { Card } from './primitives/Card';
import { CardHeader } from './primitives/CardHeader';

interface Props {
  form: QuoteFormData;
  errors: Record<string, string>;
  suggestions: string[];
  totalParts: number;
  totalLabor: number;
  onAdd: (description?: string) => void;
  onUpdate: (id: string, key: 'description' | 'quantity' | 'unitPrice', value: string) => void;
  onBlurItem: (id: string, key: 'description' | 'quantity' | 'unitPrice') => void;
  onDelete: (id: string) => void;
  onAddLabor: (serviceId: string) => void;
  onDeleteLabor: (laborId: string) => void;
  onApplyTemplate: (template: QuoteTemplate) => void;
}

const ACTION_CLASS = 'mac-press flex size-11 items-center justify-center rounded-lg text-mac-ink-2 hover:bg-mac-fill hover:text-mac-danger';

export function RefaccionesCard({ form, errors, suggestions, totalParts, totalLabor, onAdd, onUpdate, onBlurItem, onDelete, onAddLabor, onDeleteLabor, onApplyTemplate }: Props) {
  // Solo las filas agregadas después del primer render se animan al entrar.
  const initialIds = useRef(new Set(form.items.map((item) => item.id)));
  const atLimit = form.items.length >= MAX_CONCEPTS;
  const serviceIds = new Set(form.items.filter((item) => item.type !== 'labor').map((item) => item.id));
  // Labor lines that hang under a service are drawn inside that service's group; the rest (old quotations) stand alone.
  const isAttached = (item: QuoteDraftItem) => item.type === 'labor' && Boolean(item.parentId) && serviceIds.has(item.parentId!);
  let serviceCount = 0;
  let looseCount = 0;

  function laborRow(labor: QuoteDraftItem, key: string, serviceLabel: string, owner?: QuoteDraftItem) {
    const rowId = `item-${labor.id}`;
    const priceError = errors[`item-${labor.id}-unitPrice`];
    const amount = roundCurrency((parseDecimal(labor.quantity) || 1) * amountValue(labor.unitPrice));
    const label = owner ? `Mano de obra de ${owner.description.trim() || serviceLabel}` : 'Mano de obra';
    return <div key={labor.id} role="group" aria-label={label} data-testid={`mano-obra-fila-${key}`} className={`border-l-[3px] border-l-mac-accent bg-[#fff8f2] px-4 py-2 ${initialIds.current.has(labor.id) ? '' : 'animate-row-in'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-h-11 min-w-0 flex-[1_1_220px] items-center gap-2 pl-3 text-sm text-mac-ink-2">
          <CornerDownRight size={16} aria-hidden="true" className="flex-none text-mac-accent" />
          <span>{LABOR_DESCRIPTION}</span>
          <span aria-hidden="true" className="rounded bg-[#fde3cf] px-1.5 py-px text-[10px] font-bold tracking-wide text-[#9a3412]">M.O.</span>
        </div>
        <span aria-hidden="true" className="w-[72px] text-center text-sm text-mac-ink-2">—</span>
        <div className="mac-money w-[120px]" data-invalid={priceError ? 'true' : undefined}><span aria-hidden="true">$</span><input id={`labor-price-${labor.id}`} autoComplete="off" aria-required="true" data-testid={`mano-obra-precio-${key}`} aria-label={`Precio de ${label.charAt(0).toLowerCase()}${label.slice(1)}`} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? `${rowId}-unitPrice-error` : undefined} onBlur={() => onBlurItem(labor.id, 'unitPrice')} className="tnum" inputMode="decimal" value={labor.unitPrice} onChange={(event) => onUpdate(labor.id, 'unitPrice', sanitizeMoneyInput(event.target.value))} /></div>
        <output aria-label={`Importe de ${label.charAt(0).toLowerCase()}${label.slice(1)}`} data-testid={`mano-obra-importe-${key}`} className="tnum w-[112px] text-right text-sm font-semibold text-mac-accent-text">{formatMoney(amount)}</output>
        <button type="button" data-testid={`mano-obra-eliminar-${key}`} aria-label={`Quitar ${label.charAt(0).toLowerCase()}${label.slice(1)}`} className={ACTION_CLASS} onClick={() => onDeleteLabor(labor.id)}><X size={17} aria-hidden="true" /></button>
      </div>
      <FieldError id={`${rowId}-unitPrice-error`} message={priceError} className="pt-1 pl-3" />
    </div>;
  }

  return <Card delayMs={70} className="@container">
    <CardHeader icon={<Wrench size={18} />} title="Servicios y refacciones" subtitle="Agrega cada trabajo y, debajo, su mano de obra." trailing={<div className="flex items-center gap-2"><TemplatesMenu onApply={onApplyTemplate} /><span data-testid="contador-conceptos" data-level={conceptCounterLevel(form.items.length)} className="mac-concept-counter" aria-live="polite">Conceptos {form.items.length}/{MAX_CONCEPTS}</span></div>} />
    <div aria-hidden="true" className="hidden items-center gap-2 border-t border-mac-separator bg-mac-header-cols px-4 py-2 text-xs font-medium text-mac-ink-2 @[640px]:flex">
      <span className="min-w-0 flex-[1_1_220px]">Descripción</span>
      <span className="w-[72px]">Cant.</span>
      <span className="w-[120px]">Precio</span>
      <span className="w-[112px] text-right">Importe</span>
      <span className="w-11" />
    </div>
    {form.items.map((item) => {
      if (isAttached(item)) return null;
      if (item.type === 'labor') return <div key={item.id} className="border-t-2 border-mac-separator">{laborRow(item, `suelta-${looseCount++}`, 'Mano de obra')}</div>;

      const index = serviceCount++;
      const rowId = `item-${item.id}`;
      const descError = errors[`item-${item.id}-description`];
      const qtyError = errors[`item-${item.id}-quantity`];
      const priceError = errors[`item-${item.id}-unitPrice`];
      const zeroPrice = item.unitPrice.trim() !== '' && amountValue(item.unitPrice) === 0;
      const amount = roundCurrency(parseDecimal(item.quantity) * amountValue(item.unitPrice));
      const labor = laborOf(form.items, item.id);
      const serviceLabel = `servicio ${index + 1}`;
      return <div key={item.id} data-testid={`grupo-concepto-${index}`} className="border-t-2 border-mac-separator first:border-t">
        <div data-testid={`refaccion-fila-${index}`} className={`px-4 py-2 ${initialIds.current.has(item.id) ? '' : 'animate-row-in'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <SuggestionInput data-testid={`refaccion-descripcion-${index}`} aria-required="true" aria-label={`Descripción del concepto ${index + 1}`} aria-invalid={Boolean(descError)} aria-describedby={descError ? `${rowId}-description-error` : undefined} className="mac-fill-input min-w-0 flex-[1_1_220px]" onBlur={() => onBlurItem(item.id, 'description')} value={item.description} suggestions={suggestions} onChange={(value) => onUpdate(item.id, 'description', value)} />
            <input data-testid={`refaccion-cantidad-${index}`} aria-required="true" aria-label={`Cantidad del concepto ${index + 1}`} aria-invalid={Boolean(qtyError)} aria-describedby={qtyError ? `${rowId}-quantity-error` : undefined} onBlur={() => onBlurItem(item.id, 'quantity')} className="mac-fill-input w-[72px] tnum" type="number" min="1" step="1" value={item.quantity} onChange={(event) => onUpdate(item.id, 'quantity', event.target.value)} />
            <div className="mac-money w-[120px]" data-invalid={priceError ? 'true' : undefined}><span aria-hidden="true">$</span><input autoComplete="off" aria-required="true" data-testid={`refaccion-precio-${index}`} aria-label={`Precio unitario del concepto ${index + 1}`} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? `${rowId}-unitPrice-error` : undefined} onBlur={() => onBlurItem(item.id, 'unitPrice')} className="tnum" inputMode="decimal" value={item.unitPrice} onChange={(event) => onUpdate(item.id, 'unitPrice', sanitizeMoneyInput(event.target.value))} /></div>
            <output aria-label={`Importe del concepto ${index + 1}`} data-testid={`refaccion-importe-${index}`} className="tnum w-[112px] text-right text-sm font-medium">{formatMoney(amount)}</output>
            <button type="button" data-testid={`refaccion-eliminar-${index}`} aria-label={labor ? `Eliminar concepto ${index + 1} y su mano de obra` : `Eliminar concepto ${index + 1}`} className={ACTION_CLASS} onClick={() => onDelete(item.id)}><Trash2 size={17} aria-hidden="true" /></button>
          </div>
          {zeroPrice && !priceError && <p data-testid={`refaccion-precio-cero-${index}`} className="mac-zero-price">Precio {formatMoney(0)}</p>}
          <FieldError id={`${rowId}-description-error`} message={descError} className="pt-1" />
          <FieldError id={`${rowId}-quantity-error`} message={qtyError} className="pt-1" />
          <FieldError id={`${rowId}-unitPrice-error`} message={priceError} className="pt-1" />
        </div>
        {labor && laborRow(labor, String(index), serviceLabel, item)}
        {!labor && (atLimit
          ? <p data-testid={`mano-obra-limite-${index}`} className="px-4 pb-2 pl-7 text-xs font-medium text-mac-danger">{CONCEPT_LIMIT_MESSAGE}</p>
          : <div className="px-4 pb-1 pl-7"><button type="button" data-testid={`mano-obra-agregar-${index}`} aria-label={`Agregar mano de obra a ${item.description.trim() || serviceLabel}`} className="mac-press inline-flex h-9 items-center gap-1 rounded-md text-xs font-semibold text-mac-accent-text hover:text-mac-accent-hover" onClick={() => onAddLabor(item.id)}><Plus size={13} aria-hidden="true" />Mano de obra de este servicio</button></div>)}
      </div>;
    })}
    {errors.items && <p role="alert" className="border-t border-mac-separator px-4 py-2 text-xs font-medium text-mac-danger">{errors.items}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-mac-separator px-4">
      <div className="flex flex-wrap items-center gap-x-3">
        <button type="button" data-testid="refaccion-agregar" disabled={atLimit} aria-describedby={atLimit ? "limite-conceptos" : undefined} className="mac-press flex h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-mac-accent-text hover:text-mac-accent-hover disabled:cursor-not-allowed disabled:opacity-50" onClick={() => onAdd()}><Plus size={16} aria-hidden="true" />Agregar servicio o refacción</button>
        {atLimit && <p id="limite-conceptos" data-testid="limite-conceptos" className="text-xs font-medium text-mac-danger">{CONCEPT_LIMIT_MESSAGE}</p>}
      </div>
      <p className="text-sm text-mac-ink-2">Refacciones <strong data-testid="refacciones-total" className="tnum font-bold text-mac-ink">{formatMoney(totalParts)}</strong> · Mano de obra <strong data-testid="mano-obra-total" className="tnum font-bold text-mac-accent-text">{formatMoney(totalLabor)}</strong></p>
    </div>
  </Card>;
}
