import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findCustomerMatch, normalizeName, resolveCustomerSave } from '../src/services/customerMatching.ts';

const juan = { id: 'c1', name: 'Juan Pérez', phone: '6673518806', email: 'juan@correo.com', aliases: ['Juanito'] };
const customers = [juan];
const never = async () => { throw new Error('ask must not be called'); };

test('normalizeName ignores accents, casing and repeated spaces', () => {
  assert.equal(normalizeName('  JUAN   Pérez '), 'juan perez');
  assert.equal(normalizeName('Juan\tPerez'), 'juan perez');
});

test('same name + same phone reuses silently (accents, casing, phone format ignored)', async () => {
  for (const name of ['Juan Pérez', 'juan perez', 'JUAN PÉREZ', ' juan   pérez ', 'Juanito']) {
    for (const phone of ['6673518806', '(667) 351-8806', '+52 667 351 8806']) {
      const result = await resolveCustomerSave(customers, { name, phone }, never);
      assert.deepEqual(result, { action: 'reuse', customer: juan }, `${name} / ${phone}`);
    }
  }
});

test('same name + different phone asks; "same" updates the phone', async () => {
  let asked = 0;
  const result = await resolveCustomerSave(customers, { name: 'juan perez', phone: '(667) 000-1111' }, async (existing) => { asked += 1; assert.equal(existing, juan); return 'same'; });
  assert.equal(asked, 1);
  assert.deepEqual(result, { action: 'updatePhone', customer: juan, phone: '6670001111' });
});

test('same name + different phone: "other" creates, "cancel" aborts', async () => {
  const input = { name: 'JUAN PÉREZ', phone: '6670001111' };
  assert.deepEqual(await resolveCustomerSave(customers, input, async () => 'other'), { action: 'create' });
  assert.deepEqual(await resolveCustomerSave(customers, input, async () => 'cancel'), { action: 'cancel' });
});

test('one empty phone asks too; an empty typed phone never erases the stored one', async () => {
  assert.equal(findCustomerMatch(customers, 'Juan Pérez', '').kind, 'differentPhone');
  const noPhone = { ...juan, phone: '' };
  assert.equal(findCustomerMatch([noPhone], 'Juan Pérez', '6670001111').kind, 'differentPhone');
  assert.deepEqual(await resolveCustomerSave(customers, { name: 'Juan Pérez', phone: '' }, async () => 'same'), { action: 'reuse', customer: juan });
  assert.deepEqual(await resolveCustomerSave([noPhone], { name: 'Juan Pérez', phone: '6670001111' }, async () => 'same'), { action: 'updatePhone', customer: noPhone, phone: '6670001111' });
});

test('both phones empty is the same customer; unknown name creates', async () => {
  const noPhone = { ...juan, phone: '' };
  assert.equal(findCustomerMatch([noPhone], 'juan pérez', '').kind, 'same');
  assert.deepEqual(await resolveCustomerSave(customers, { name: 'María López', phone: '6670001111' }, never), { action: 'create' });
  assert.deepEqual(await resolveCustomerSave([], { name: 'Juan Pérez', phone: '' }, never), { action: 'create' });
});

test('a same-phone customer wins over an earlier same-name one with another phone', () => {
  const other = { ...juan, id: 'c2', phone: '6670001111' };
  const match = findCustomerMatch([juan, other], 'Juan Pérez', '6670001111');
  assert.equal(match.kind, 'same');
  assert.equal(match.customer.id, 'c2');
});
