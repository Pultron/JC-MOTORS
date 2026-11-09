export function toCents(amount: number): number {
  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error('El importe excede el límite permitido.');
  return cents;
}

export function parseCents(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) throw new Error('Usa importes positivos con un máximo de dos decimales.');
  const [whole, decimal = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('El importe excede el límite permitido.');
  return cents;
}
