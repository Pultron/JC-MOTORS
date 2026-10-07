import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateQuotationTotals } from '../src/utils/quotation.ts';
import { quoteDraftService } from '../src/services/quoteDraftService.ts';
import { quotationService } from '../src/services/quotationService.ts';
import { getVehicleModels, vehicleBrands } from '../src/services/vehicleCatalog.ts';
import { validateQuoteForm } from '../src/services/quoteValidation.ts';
import { customerService } from '../src/services/customerService.ts';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => { storage.set(key, String(value)); },
  removeItem: (key) => { storage.delete(key); },
};

const form = () => ({
  customerId: '', customerName: 'Carlos Méndez', phone: '55 1234 5678', email: 'carlos@correo.com',
  make: 'Nissan', model: 'Sentra', year: '2022', plates: 'ABC-123-A',
  items: [
    { id: 'labor-1', type: 'labor', description: 'Cambio de aceite', quantity: '1', unitPrice: '550' },
    { id: 'part-1', type: 'part', description: 'Filtro de aceite', quantity: '1', unitPrice: '280' },
  ],
  laborDiscountType: 'percentage', laborDiscountValue: '10', ivaEnabled: true,
  validityDays: '15', publicNotes: 'Observación', customerNotes: 'Nota para el cliente',
});

test('calcula descuento solamente sobre mano de obra, IVA y total con decimales', () => {
  const items = [
    { type: 'labor', quantity: 1, saleUnitPrice: 550 },
    { type: 'part', quantity: 1, saleUnitPrice: 280 },
  ];
  assert.deepEqual(calculateQuotationTotals(items, 'percentage', 10, true), {
    subtotalRefacciones: 280, subtotalManoObra: 550, laborDiscount: 55,
    subtotalNeto: 775, ivaAmount: 124, total: 899,
  });
  assert.equal(calculateQuotationTotals(items, 'fixed', 100, false).total, 730);
  assert.equal(calculateQuotationTotals([{ type: 'part', quantity: 3, saleUnitPrice: 0.1 }], 'fixed', 0, false).total, 0.3);
});

test('valida los campos obligatorios y formatos sin exigir correo opcional', () => {
  const valid = form();
  const totals = calculateQuotationTotals(valid.items.map((item) => ({ type: item.type, quantity: Number(item.quantity), saleUnitPrice: Number(item.unitPrice) })), 'percentage', 10, true);
  assert.deepEqual(validateQuoteForm(valid, totals), {});
  const invalid = { ...valid, customerName: '', make: '', model: '', email: 'mal-correo', phone: 'ABC', items: [{ ...valid.items[0], quantity: '0', unitPrice: '-1' }] };
  const errors = validateQuoteForm(invalid, totals);
  for (const key of ['customerName', 'make', 'model', 'email', 'phone', 'items', 'item-labor-1-quantity', 'item-labor-1-unitPrice']) assert.ok(errors[key], key);
});

test('catálogo de modelos depende de la marca', () => {
  assert.ok(vehicleBrands.includes('Nissan'));
  assert.ok(getVehicleModels('Nissan').includes('Sentra'));
  assert.ok(!getVehicleModels('Toyota').includes('Sentra'));
});

test('el directorio de clientes se guarda en localStorage', () => {
  const customers = customerService.list();
  assert.ok(customers.some((customer) => customer.name === 'Carlos Méndez'));
  customerService.save([...customers, { id: 'new-customer', name: 'Cliente nuevo', phone: '', aliases: [] }]);
  assert.ok(customerService.list().some((customer) => customer.id === 'new-customer'));
});

test('guarda, recupera y elimina borradores; conserva folio al guardar cotización', async () => {
  const data = form();
  const draft = await quoteDraftService.save(data);
  assert.equal(draft.folio, 'JC-0013');
  assert.equal(draft.status, 'Borrador');
  quoteDraftService.saveTemporary(data, draft.id);
  assert.equal(quoteDraftService.getTemporary()?.draftId, draft.id);
  assert.equal(quoteDraftService.list()[0].data.customerName, data.customerName);
  const input = {
    customer: { name: data.customerName, phone: data.phone, email: data.email },
    vehicle: { make: data.make, model: data.model, year: Number(data.year), plates: data.plates },
    items: data.items.map((item) => ({ id: item.id, type: item.type, description: item.description, quantity: Number(item.quantity), saleUnitPrice: Number(item.unitPrice) })),
    laborDiscountType: data.laborDiscountType, laborDiscountValue: Number(data.laborDiscountValue),
    includeVat: data.ivaEnabled, validityDays: Number(data.validityDays), publicNotes: data.publicNotes, customerNotes: data.customerNotes,
  };
  const other = await quotationService.create(input);
  assert.equal(other.folio, 'JC-0014');
  const quote = await quotationService.create({ ...input, preferredFolio: draft.folio });
  assert.equal(quote.folio, draft.folio);
  assert.equal(quote.status, 'Pendiente');
  assert.equal(quote.items[1].amount, 280);
  assert.equal(quote.customerNotes, data.customerNotes);
  assert.equal(quote.subtotalNeto, 775);
  assert.equal(quote.ivaAmount, 124);
  assert.equal(quote.total, 899);
  assert.equal((await quotationService.getById(quote.id)).total, 899);
  quoteDraftService.delete(draft.id);
  quoteDraftService.deleteTemporary();
  assert.equal(quoteDraftService.list().length, 0);
  assert.equal(quoteDraftService.getTemporary(), null);
  assert.equal(await quoteDraftService.nextFolio(), 'JC-0015');
});
