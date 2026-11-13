process.env.TZ = 'America/Mazatlan';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterByShare, matchesShareFilter, shareFilterEmptyTitle, shareFilterFromParam } from '../src/services/shareFilter.ts';

const WA = { sharedAt: '2026-11-13T00:48:00.000Z', sharedVia: 'whatsapp' };
const MAIL = { sharedAt: '2026-11-03T16:10:00.000Z', sharedVia: 'email' };

test('share filter: param parsing and matching', () => {
  assert.equal(shareFilterFromParam(null), 'todas');
  assert.equal(shareFilterFromParam('basura'), 'todas');
  assert.equal(shareFilterFromParam('Sin-Compartir'), 'sin-compartir');
  const rows = [{ id: 1 }, { id: 2, ...WA }, { id: 3, ...MAIL }, { id: 4, sharedAt: 'x', sharedVia: 'email' }];
  const ids = (filter) => filterByShare(rows, filter).map((row) => row.id);
  assert.deepEqual(ids('todas'), [1, 2, 3, 4]);
  assert.deepEqual(ids('compartidas'), [2, 3]);
  assert.deepEqual(ids('sin-compartir'), [1, 4]);
  assert.deepEqual(ids('whatsapp'), [2]);
  assert.deepEqual(ids('correo'), [3]);
  assert.equal(matchesShareFilter({}, 'whatsapp'), false);
});

test('share filter empty titles', () => {
  assert.equal(shareFilterEmptyTitle('sin-compartir'), 'No hay cotizaciones sin compartir');
  assert.match(shareFilterEmptyTitle('correo'), /correo/);
});
