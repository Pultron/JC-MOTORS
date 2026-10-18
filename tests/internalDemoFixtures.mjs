// Isolated browser-test fixtures; never imported by the application or production storage.
export function internalDemoFixtures() {
  const now = new Date();
  const date = days => new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - days), 12).toISOString();
  const clients = [['Carlos Méndez', 'Nissan', 'Sentra', 2022, 4850], ['María González', 'Toyota', 'Corolla', 2020, 6200], ['Luis Ramírez', 'Honda', 'Civic', 2021, 3900], ['Ana Torres', 'Chevrolet', 'Aveo', 2019, 2750]];
  const quotations = clients.map(([name, make, model, year, sold], i) => ({
    id: `demo-${i}`, folio: `JC-00${42 - i}`, createdAt: date(i), approvedAt: date(i), status: 'Aprobada', customer: { name, phone: '6671234567' }, vehicle: { make, model, year, plates: `ABC-${i}` },
    items: [{ id: `part-${i}-1`, type: 'part', description: 'Balatas delanteras', quantity: 1, saleUnitPrice: 1200, amount: 1200 }, { id: `part-${i}-2`, type: 'part', description: 'Aceite sintético', quantity: 1, saleUnitPrice: 850, amount: 850 }, { id: `part-${i}-3`, type: 'part', description: 'Filtro de aceite', quantity: 1, saleUnitPrice: 300, amount: 300 }, { id: `labor-${i}`, type: 'labor', description: 'Mano de obra', quantity: 1, saleUnitPrice: sold - 2350, amount: sold - 2350 }],
    laborDiscountType: 'fixed', laborDiscountValue: 0, includeVat: true, validityDays: 15, publicNotes: '',
  }));
  const records = quotations.slice(0, 3).map((q, i) => ({ id: `cost-${i}`, quoteId: q.id, itemCosts: q.items.filter(item => item.type === 'part').map((item, j) => ({ quoteItemId: item.id, actualUnitCostCents: i === 1 && j === 2 ? null : [78000, 62000, 18000][j] })), additionalExpenses: [{ id: `expense-${i}`, description: 'Envío / traslado', amountCents: 12000 }], createdAt: date(i), updatedAt: date(i) }));
  return { quotations, records };
}
