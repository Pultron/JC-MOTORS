process.env.TZ = 'America/Mazatlan';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDate, formatTime12 } from '../src/utils/dateFormat.ts';
import { shareAccessibleLabel, shareLineText } from '../src/services/shareStatus.ts';

const NOW = new Date('2026-11-12T20:00:00.000Z');
const WA = { sharedAt: '2026-11-13T00:48:00.000Z', sharedVia: 'whatsapp' }; // 17:48 local = 5:48 p.m.
const MAIL = { sharedAt: '2026-11-03T16:10:00.000Z', sharedVia: 'email' }; // 9:10 a.m. local

test('sharedShort: day numeric, short month without dot, 12h with a.m./p.m.', () => {
  assert.equal(formatDate('2026-11-13T01:48:00.000Z', 'sharedShort', NOW), '12 nov, 6:48 p.m.');
  assert.equal(formatDate(MAIL.sharedAt, 'sharedShort', NOW), '3 nov, 9:10 a.m.');
  assert.equal(formatTime12('2026-11-12T19:00:00.000Z'), '12:00 p.m.');
});

test('sharedShort adds the year only when it is not the current one', () => {
  assert.equal(formatDate('2025-11-13T01:48:00.000Z', 'sharedShort', NOW), '12 nov 2025, 6:48 p.m.');
  assert.equal(formatDate('2026-09-13T01:48:00.000Z', 'sharedShort', NOW), '12 sep, 6:48 p.m.');
  assert.equal(formatDate('basura', 'sharedShort', NOW), '');
});

test('line text: none, whatsapp, email, invalid record', () => {
  assert.equal(shareLineText({}, NOW), 'Sin compartir');
  assert.equal(shareLineText(WA, NOW), 'WhatsApp · 12 nov, 5:48 p.m.');
  assert.equal(shareLineText(MAIL, NOW), 'Correo · 3 nov, 9:10 a.m.');
  assert.equal(shareLineText({ sharedAt: 'basura', sharedVia: 'email' }, NOW), 'Sin compartir');
  assert.equal(shareLineText({ sharedAt: WA.sharedAt }, NOW), 'Sin compartir');
});

test('accessible label reads as one sentence', () => {
  assert.equal(shareAccessibleLabel('Yarely', WA), 'Yarely, compartida por WhatsApp el 12 de noviembre de 2026 a las 5:48 p.m.');
  assert.equal(shareAccessibleLabel('Yarely', MAIL), 'Yarely, compartida por correo el 3 de noviembre de 2026 a las 9:10 a.m.');
  assert.equal(shareAccessibleLabel('Yarely', {}), 'Yarely, sin compartir');
  assert.equal(shareAccessibleLabel('  ', {}), 'Sin compartir');
});
