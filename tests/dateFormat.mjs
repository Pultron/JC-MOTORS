process.env.TZ = 'America/Mazatlan'; // UTC-7: date-only strings parsed as UTC show the previous day
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, formatDate, monthKey, parseDate, toIsoDate } from '../src/utils/dateFormat.ts';
import { validUntil } from '../src/services/quotationLayout.ts';

test('#046 the zone is America/Mazatlan and reproduces the UTC offset bug', () => {
  assert.equal(new Date().getTimezoneOffset(), 420);
  assert.equal(new Date('2026-11-18').getDate(), 17); // the bug we avoid
});

test('#046 date-only strings keep their day (local parse)', () => {
  assert.equal(formatDate('2026-11-18', 'long'), '18 de noviembre de 2026');
  assert.equal(formatDate('2026-11-06', 'short'), '06/11/2026');
  assert.equal(formatDate('2026-11-06', 'medium'), '06 nov 2026');
  assert.equal(formatDate('2026-11-06', 'iso'), '2026-11-06');
  assert.equal(formatDate('2026-11-06', 'long'), '6 de noviembre de 2026');
});

test('#046 month end, leap day and Dec 31', () => {
  assert.equal(formatDate('2026-01-31', 'long'), '31 de enero de 2026');
  assert.equal(formatDate('2028-02-29', 'long'), '29 de febrero de 2028');
  assert.equal(formatDate('2026-12-31', 'short'), '31/12/2026');
  assert.equal(toIsoDate(addDays(parseDate('2026-01-31'), 1)), '2026-02-01');
  assert.equal(toIsoDate(addDays(parseDate('2028-02-28'), 1)), '2028-02-29');
  assert.equal(toIsoDate(addDays(parseDate('2027-02-28'), 1)), '2027-03-01');
  assert.equal(toIsoDate(addDays(parseDate('2026-12-31'), 1)), '2027-01-01');
  assert.equal(monthKey('2026-12-31'), '2026-12');
});

test('#046 invalid dates do not throw or print garbage', () => {
  assert.equal(parseDate('2027-02-29'), null);
  assert.equal(formatDate('nope', 'long'), '');
  assert.equal(formatDate('', 'short'), '');
});

test('#046 dateTime and monthYear', () => {
  assert.match(formatDate(new Date(2026, 10, 6, 14, 5), 'dateTime'), /^6 de noviembre de 2026/);
  assert.equal(formatDate(new Date(2026, 10, 1), 'monthYear'), 'noviembre de 2026');
});

test('#046 validUntil shows the right day (validity from the local creation day)', () => {
  const at = (createdAt, validityDays) => formatDate(validUntil({ createdAt, validityDays }), 'iso');
  assert.equal(at('2026-11-04T18:00:00.000Z', 14), '2026-11-18'); // 11:00 local
  assert.equal(at('2026-11-19T02:00:00.000Z', 0), '2026-11-18'); // 19:00 local on the 18th (UTC already the 19th)
  assert.equal(at('2026-01-31T20:00:00.000Z', 30), '2026-03-02');
  assert.equal(at('2028-02-01T18:00:00.000Z', 28), '2028-02-29');
  assert.equal(at('2026-12-01T18:00:00.000Z', 30), '2026-12-31');
  assert.equal(formatDate(validUntil({ createdAt: '2026-11-04T18:00:00.000Z', validityDays: 14 }), 'long'), '18 de noviembre de 2026');
});
