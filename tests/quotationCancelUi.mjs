import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const { buildMenuItems } = await import('../src/components/quotationMenuItems.ts');
const { cancelledLineText, cancelledNoticeText, sharedCancelNote, CANCELLATION_REASON_SUGGESTIONS } = await import('../src/services/cancellationText.ts');

const quote = (extra = {}) => ({ id: 'q1', folio: 'JC-0005', status: 'Aprobada', customer: { name: 'Ana', phone: '' }, ...extra });
const menu = (status, extra = {}) => buildMenuItems({
  quotation: quote({ status, ...extra }), navigate: () => {}, onOpenPdf: () => {}, onApprove: () => {}, onCancel: () => {}, onDelete: () => {},
  share: () => {}, canShare: () => true,
});

test('an approved quotation offers "Cancelar cotización" (danger, after a divider) and never direct deletion', () => {
  const items = menu('Aprobada');
  const cancel = items.find((item) => item.key === 'cancel');
  assert.equal(cancel.label, 'Cancelar cotización');
  assert.equal(cancel.tone, 'danger');
  assert.equal(cancel.separatorBefore, true);
  assert.equal(cancel.icon.displayName ?? cancel.icon.name ?? 'Ban', 'Ban');
  assert.equal(items.some((item) => item.key === 'delete' || /Eliminar/.test(item.label)), false);
  assert.equal(items.at(-1).key, 'cancel');
});

test('cancelled quotations can be deleted but not cancelled again; pending keeps approve/cancel', () => {
  const cancelled = menu('Cancelada').map((item) => item.key);
  assert.ok(cancelled.includes('delete') && !cancelled.includes('cancel') && !cancelled.includes('approve'));
  const pending = menu('Pendiente').map((item) => item.key);
  assert.ok(pending.includes('approve') && pending.includes('cancel') && !pending.includes('delete'));
});

test('cancel dialog texts: shared note matches the real medium and date, reasons are the agreed suggestions', () => {
  assert.equal(sharedCancelNote(quote()), undefined);
  const wa = sharedCancelNote(quote({ sharedVia: 'whatsapp', sharedAt: new Date(2026, 10, 18, 18, 48).toISOString() }));
  assert.equal(wa, 'Esta cotización ya se compartió con el cliente por WhatsApp el 18 nov.');
  const mail = sharedCancelNote(quote({ sharedVia: 'email', sharedAt: new Date(2026, 10, 3, 9, 0).toISOString() }));
  assert.equal(mail, 'Esta cotización ya se compartió con el cliente por correo el 3 nov.');
  assert.deepEqual([...CANCELLATION_REASON_SUGGESTIONS], ['El cliente ya no quiso el trabajo', 'Se aprobó por error', 'Se hará una cotización nueva']);
});

test('cancelled display texts, including old records without reason or date', () => {
  assert.equal(cancelledLineText({ cancellationReason: 'Se aprobó por error' }), 'Cancelada · Se aprobó por error');
  assert.equal(cancelledLineText({}), 'Cancelada');
  const at = new Date(2026, 10, 18, 23, 40).toISOString();
  assert.equal(cancelledNoticeText({ cancelledAt: at, cancellationReason: 'Se aprobó por error' }), 'Cancelada el 18 nov 2026, 11:40 p.m. · Motivo: Se aprobó por error');
  assert.equal(cancelledNoticeText({ cancelledAt: at }), 'Cancelada el 18 nov 2026, 11:40 p.m.');
  assert.equal(cancelledNoticeText({}), undefined);
});

test('the reason dialog is wired for keyboard use and blocks confirm without a reason', () => {
  const source = readFileSync(new URL('../src/components/ui/ConfirmDialog.tsx', import.meta.url), 'utf8');
  assert.match(source, /confirmDisabled=\{reason\.trim\(\) === ''\}/);
  assert.match(source, /data-autofocus/);
  assert.match(source, /data-enter-native/);
  assert.match(source, /if \(!confirmDisabledRef\.current\) finish\('primary'\)/);
  const actions = readFileSync(new URL('../src/hooks/useQuotationActions.tsx', import.meta.url), 'utf8');
  assert.match(actions, /cancelLabel: 'Mantener aprobada'/);
  assert.match(actions, /if \(!answer\) return;/);
});
