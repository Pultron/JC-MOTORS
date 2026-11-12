import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  daysAgoText, formatBytes, formatInvoiceFolio, formatLastBackup, formatQuotationFolio, formatRestoredCounts, restoredMessage,
} from '../src/storage/backupFormat.ts';

test('formatBytes usa bytes, KB y MB con un decimal', () => {
  assert.equal(formatBytes(0), '0 bytes');
  assert.equal(formatBytes(1), '1 byte');
  assert.equal(formatBytes(512), '512 bytes');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2.4 * 1024 * 1024), '2.4 MB');
  assert.equal(formatBytes(-5), '0 bytes');
});

test('daysAgoText: hoy, ayer y hace N días', () => {
  assert.equal(daysAgoText(0), 'hoy');
  assert.equal(daysAgoText(1), 'ayer');
  assert.equal(daysAgoText(3), 'hace 3 días');
});

test('formatLastBackup: fecha larga en español y días transcurridos', () => {
  const now = new Date(2026, 10, 15, 12, 0, 0).getTime();
  const iso = new Date(2026, 10, 12, 9, 30, 0).toISOString();
  assert.equal(formatLastBackup(iso, now), '12 de noviembre de 2026 (hace 3 días)');
  assert.equal(formatLastBackup(null, now), 'Todavía no has exportado un respaldo');
  assert.equal(formatLastBackup('no-es-fecha', now), 'Todavía no has exportado un respaldo');
});

test('mensaje de restauración con plurales', () => {
  assert.equal(restoredMessage({ quotations: 132, customers: 48, invoices: 15 }), 'Respaldo restaurado: 132 cotizaciones, 48 clientes, 15 facturas');
  assert.equal(formatRestoredCounts({ quotations: 1, customers: 1, invoices: 1 }), '1 cotización, 1 cliente, 1 factura');
});

test('folios del resumen', () => {
  assert.equal(formatQuotationFolio(42), 'JC-0042');
  assert.equal(formatQuotationFolio(0), '—');
  assert.equal(formatInvoiceFolio(7), '0007');
  assert.equal(formatInvoiceFolio(0), '—');
});
