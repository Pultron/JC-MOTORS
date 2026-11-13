import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DoneSheet, MissingContactDialog } from '../components/share/ShareDialogs';
import type { ShareDoneState } from '../components/share/ShareDialogs';
import { useToast } from '../components/ui/Toast';
import { loadBusinessInfo } from '../config/businessInfo';
import type { Invoice } from '../models/invoice';
import type { ShareMedium } from '../models/quotation';
import { generarFacturaPdf } from '../services/invoicePdf';
import { invoiceFilenameBase, resolveInvoiceContact } from '../services/invoiceShare';
import { buildInvoiceShareMessage } from '../services/shareMessage';
import {
  copyFileToClipboard, decideShareStep, hasMedium, nativeInvoke, openGmail, openShareLink, openShareUrlInBrowser, otherMedium,
  revealInFolder, saveSharedFile,
} from '../services/shareQuotation';
import type { ShareContact } from '../services/shareQuotation';
import { useCustomers } from '../store/CustomerContext';
import { warnIfLogoMissing } from '../utils/pdfAssetsCore';
import { savePdfFile } from '../utils/savePdfFile';
import { normalizeEmail, phoneForStorage } from '../validation/fields';

type Flow =
  | null
  | { step: 'missing'; invoice: Invoice; medium: ShareMedium }
  | ({ step: 'done' } & ShareDoneState);

export interface InvoiceShare {
  /** Starts the WhatsApp / email flow for an invoice (asks for the missing contact medium first). */
  shareInvoice: (invoice: Invoice, medium: ShareMedium) => void;
  /** True when the matching Cliente already has what this medium needs (drives the active/muted look). */
  canUse: (invoice: Invoice, medium: ShareMedium) => boolean;
  busy: boolean;
  /** The dialogs of the flow. Render it once, anywhere in the page. */
  dialogs: ReactNode;
}

/**
 * Shares the invoice's designed PDF (the same one "Descargar PDF" generates) like quotations are shared: the file goes to the clipboard, WhatsApp / the
 * mail client opens with the message, and the share is recorded. Contact data comes from the Cliente matching the receptor.
 */
export function useInvoiceShare(markShared: (uuid: string, via: ShareMedium) => Promise<unknown>): InvoiceShare {
  const toast = useToast();
  const { customers, updateCustomer } = useCustomers();
  const [flow, setFlow] = useState<Flow>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const canUse = useCallback((invoice: Invoice, medium: ShareMedium) => hasMedium(medium, resolveInvoiceContact(invoice, customers).contact), [customers]);

  const perform = useCallback(async (invoice: Invoice, medium: ShareMedium, contact: ShareContact, contactName?: string) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    const invoke = nativeInvoke();
    try {
      const message = buildInvoiceShareMessage(invoice, loadBusinessInfo(), contactName);
      let path: string | null = null;
      let clipboardOk = true;
      let opened = false;
      // Always the app's designed invoice PDF (logo and layout), the same one "Descargar PDF" produces.
      try {
        const { file, logoError } = await generarFacturaPdf(invoice);
        warnIfLogoMissing({ logoError }, toast);
        if (invoke) {
          path = await saveSharedFile(invoke, new Uint8Array(await file.arrayBuffer()), invoiceFilenameBase(invoice), 'pdf');
        } else {
          await savePdfFile(file, invoiceFilenameBase(invoice), 'save_invoice_pdf');
        }
      } catch (cause) {
        console.error('[compartir] factura', cause);
        toast.error({ title: 'No se pudo preparar la factura', description: 'Inténtalo de nuevo. Si sigue igual, usa «Descargar PDF» y envíala manualmente.' });
        return;
      }

      const fileLabel = 'PDF';
      if (invoke && path) {
        try {
          await copyFileToClipboard(invoke, path);
        } catch (cause) {
          console.error('[compartir] portapapeles', cause);
          clipboardOk = false;
          toast.warning({ title: `No se pudo copiar el ${fileLabel}`, description: 'Adjúntalo desde la carpeta con «Mostrar archivo en la carpeta».' });
        }
        try {
          await openShareLink(invoke, medium, contact, message);
          opened = true;
        } catch (cause) {
          console.error('[compartir] abrir', cause);
          toast.error({ title: medium === 'whatsapp' ? 'No se pudo abrir WhatsApp' : 'No se pudo abrir tu correo', description: `El ${fileLabel} quedó guardado; puedes mostrarlo en la carpeta y enviarlo a mano.` });
        }
      } else {
        clipboardOk = false;
        opened = openShareUrlInBrowser(medium, contact, message);
        if (!opened) toast.error({ title: 'El navegador bloqueó la ventana', description: 'Permite las ventanas emergentes para este sitio e inténtalo de nuevo.' });
      }

      if (opened) {
        try {
          await markShared(invoice.uuid, medium);
        } catch (cause) {
          console.error('[compartir] registro', cause);
        }
      }
      setFlow({ step: 'done', recipient: contactName?.trim() || invoice.receptor.nombre, fileLabel, medium, contact, message, path, native: Boolean(invoke), clipboardOk, opened });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [markShared, toast]);

  const shareInvoice = useCallback((invoice: Invoice, medium: ShareMedium) => {
    if (running.current) return;
    const { contact, customer } = resolveInvoiceContact(invoice, customers);
    if (decideShareStep(medium, contact).kind === 'missing') {
      setFlow({ step: 'missing', invoice, medium });
      return;
    }
    // The current dialog (if any) stays up, disabled, until the result sheet replaces it.
    void perform(invoice, medium, contact, customer?.name);
  }, [customers, perform]);

  /** "Guardar y enviar": completes the matching Cliente when there is one (never creates one), then continues. */
  const saveContactAndSend = useCallback(async (invoice: Invoice, medium: ShareMedium, value: string) => {
    const patch = medium === 'whatsapp' ? { phone: phoneForStorage(value) } : { email: normalizeEmail(value) };
    const { contact, customer } = resolveInvoiceContact(invoice, customers);
    if (customer) {
      updateCustomer(customer.id, {
        name: customer.name,
        phone: patch.phone ?? customer.phone,
        ...((patch.email ?? customer.email) ? { email: patch.email ?? customer.email } : {}),
        aliases: customer.aliases,
      });
    }
    await perform(invoice, medium, { ...contact, ...patch }, customer?.name);
  }, [customers, perform, updateCustomer]);

  const revealFile = useCallback(async (path: string) => {
    const invoke = nativeInvoke();
    if (!invoke) return;
    try {
      await revealInFolder(invoke, path);
    } catch (cause) {
      console.error('[compartir] carpeta', cause);
      toast.error({ title: 'No se pudo abrir la carpeta', description: 'Busca el archivo en la carpeta de datos de la app, dentro de «enviados».' });
    }
  }, [toast]);

  const openInGmail = useCallback(async (state: ShareDoneState) => {
    const invoke = nativeInvoke();
    try {
      if (invoke) await openGmail(invoke, state.contact, state.message);
      else if (!openShareUrlInBrowser('gmail', state.contact, state.message)) throw new Error('blocked');
    } catch (cause) {
      console.error('[compartir] gmail', cause);
      toast.error({ title: 'No se pudo abrir Gmail', description: 'Revisa tu conexión e inténtalo de nuevo.' });
    }
  }, [toast]);

  const dialogs = useMemo<ReactNode>(() => {
    if (!flow) return null;
    const close = () => setFlow(null);
    if (flow.step === 'missing') {
      const { contact, customer } = resolveInvoiceContact(flow.invoice, customers);
      const other = otherMedium(flow.medium);
      return (
        <MissingContactDialog
          key={`missing-${flow.medium}`}
          target={flow.invoice}
          name={flow.invoice.receptor.nombre}
          docNoun="factura"
          note={customer ? 'Se guardará en los datos del cliente.' : 'Solo se usará para este envío; no se crea ningún cliente.'}
          medium={flow.medium}
          initial={contact}
          alternative={hasMedium(other, contact) ? other : null}
          busy={busy}
          onClose={close}
          onShare={shareInvoice}
          onSaveAndSend={(invoice, medium, value) => void saveContactAndSend(invoice, medium, value)}
        />
      );
    }
    return <DoneSheet key="done" state={flow} onClose={close} onReveal={(path) => void revealFile(path)} onOpenGmail={(state) => void openInGmail(state)} />;
  }, [flow, busy, customers, shareInvoice, saveContactAndSend, revealFile, openInGmail]);

  return useMemo(() => ({ shareInvoice, canUse, busy, dialogs }), [shareInvoice, canUse, busy, dialogs]);
}
