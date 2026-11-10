import type { DiscountType } from '../models/quotation';

export interface DiscountClamp {
  bounded: number;
  /** Which limit was hit; null when the value was already in range. */
  limit: 'percentage' | 'subtotal' | 'minimum' | null;
}

export const DISCOUNT_CLAMP_MESSAGES = {
  percentage: 'El descuento se ajustó al máximo: 100 %',
  subtotal: 'El descuento se ajustó al máximo: el subtotal',
  minimum: 'El descuento se ajustó al mínimo: 0',
} as const;

/** Keeps a discount inside 0..100 % (or 0..labor subtotal for fixed amounts) and reports which limit was applied. */
export function clampDiscount(type: DiscountType, value: number, laborSubtotal: number): DiscountClamp {
  if (value < 0) return { bounded: 0, limit: 'minimum' };
  const maximum = type === 'percentage' ? 100 : laborSubtotal;
  if (value > maximum) return { bounded: maximum, limit: type === 'percentage' ? 'percentage' : 'subtotal' };
  return { bounded: value, limit: null };
}
