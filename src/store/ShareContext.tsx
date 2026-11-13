import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ShareDialogs } from '../components/share/ShareDialogs';
import type { ShareDoneState } from '../components/share/ShareDialogs';
import { useToast } from '../components/ui/Toast';
import { loadBusinessInfo } from '../config/businessInfo';
import type { Quotation, ShareMedium } from '../models/quotation';
import { buildShareMessage } from '../services/shareMessage';
import {
  copyFileToClipboard, decideShareStep, effectiveContact, hasMedium, nativeInvoke, openGmail, openShareLink,
  openShareUrlInBrowser, revealInFolder, saveSharedPdf, sharedFilenameBase,
} from '../services/shareQuotation';
import type { ShareContact } from '../services/shareQuotation';
import { useCustomers } from './CustomerContext';
import { useQuotations } from './QuotationContext';
import { savePdfFile } from '../utils/savePdfFile';
import { generateQuotationPdfBlob } from '../utils/quotationPdfBlob';
import { toPublicQuotation } from '../utils/quotation';
import { normalizeEmail, phoneForStorage } from '../validation/fields';

type Flow =
  | null
  | { step: 'saved'; quotation: Quotation }
  | { step: 'missing'; quotation: Quotation; medium: ShareMedium }
  | ({ step: 'done' } & ShareDoneState);

interface ShareApi {
  /** Starts the WhatsApp / email flow for a quotation (asks for the missing contact medium first). */
  shareQuotation: (quotation: Quotation, medium: ShareMedium) => void;
  /** Persistent confirmation after saving, with both send buttons. */
  offerAfterSave: (quotation: Quotation) => void;
  /** True when the customer already has what this medium needs (drives the active/muted look of the buttons). */
  canUse: (quotation: Quotation, medium: ShareMedium) => boolean;
  busy: boolean;
}

const ShareContext = createContext<ShareApi | null>(null);

export function ShareProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const { customers, updateCustomer } = useCustomers();
  const { markQuotationShared, updateQuotationContact } = useQuotations();
  const [flow, setFlow] = useState<Flow>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const canUse = useCallback((quotation: Quotation, medium: ShareMedium) => hasMedium(medium, effectiveContact(quotation, customers)), [customers]);

  const perform = useCallback(async (quotation: Quotation, medium: ShareMedium, contact: ShareContact) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    const invoke = nativeInvoke();
    try {
      const message = buildShareMessage(toPublicQuotation(quotation), loadBusinessInfo());
      let path: string | null = null;
      let clipboardOk = true;
      let opened = false;

      try {
        const blob = await generateQuotationPdfBlob(quotation, toast);
        if (invoke) {
          path = await saveSharedPdf(invoke, blob, sharedFilenameBase(quotation.folio, quotation.customer.name));
        } else {
          await savePdfFile(new File([blob], `${quotation.folio}.pdf`, { type: 'application/pdf' }), quotation.folio);
        }
      } catch (cause) {
        console.error('[compartir] pdf', cause);
        toast.error({ title: 'No se pudo preparar el PDF', description: 'Inténtalo de nuevo. Si sigue igual, usa «Descargar PDF» y envíalo manualmente.' });
        return;
      }

      if (invoke && path) {
        try {
          await copyFileToClipboard(invoke, path);
        } catch (cause) {
          console.error('[compartir] portapapeles', cause);
          clipboardOk = false;
          toast.warning({ title: 'No se pudo copiar el PDF', description: 'Adjúntalo desde la carpeta con «Mostrar archivo en la carpeta».' });
        }
        try {
          await openShareLink(invoke, medium, contact, message);
          opened = true;
        } catch (cause) {
          console.error('[compartir] abrir', cause);
          toast.error({ title: medium === 'whatsapp' ? 'No se pudo abrir WhatsApp' : 'No se pudo abrir tu correo', description: 'El PDF quedó guardado; puedes mostrarlo en la carpeta y enviarlo a mano.' });
        }
      } else {
        clipboardOk = false;
        opened = openShareUrlInBrowser(medium, contact, message);
        if (!opened) toast.error({ title: 'El navegador bloqueó la ventana', description: 'Permite las ventanas emergentes para este sitio e inténtalo de nuevo.' });
      }

      if (opened) {
        try {
          await markQuotationShared(quotation.id, medium);
        } catch (cause) {
          console.error('[compartir] registro', cause);
        }
      }
      setFlow({ step: 'done', recipient: quotation.customer.name, medium, contact, message, path, native: Boolean(invoke), clipboardOk, opened });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [markQuotationShared, toast]);

  const shareQuotation = useCallback((quotation: Quotation, medium: ShareMedium) => {
    if (running.current) return;
    const contact = effectiveContact(quotation, customers);
    if (decideShareStep(medium, contact).kind === 'missing') {
      setFlow({ step: 'missing', quotation, medium });
      return;
    }
    // The current dialog (if any) stays up, disabled, until the result sheet replaces it.
    void perform(quotation, medium, contact);
  }, [customers, perform]);

  const offerAfterSave = useCallback((quotation: Quotation) => setFlow({ step: 'saved', quotation }), []);

  /** "Guardar y enviar": completes the customer record (when there is one) and the quotation snapshot, then continues. */
  const saveContactAndSend = useCallback(async (quotation: Quotation, medium: ShareMedium, value: string) => {
    const patch = medium === 'whatsapp' ? { phone: phoneForStorage(value) } : { email: normalizeEmail(value) };
    const record = quotation.customerId ? customers.find((customer) => customer.id === quotation.customerId) : undefined;
    if (record) {
      updateCustomer(record.id, {
        name: record.name,
        phone: patch.phone ?? record.phone,
        ...((patch.email ?? record.email) ? { email: patch.email ?? record.email } : {}),
        aliases: record.aliases,
      });
    }
    let updated: Quotation = { ...quotation, customer: { ...quotation.customer, ...patch } };
    try {
      updated = (await updateQuotationContact(quotation.id, patch)) ?? updated;
    } catch (cause) {
      console.error('[compartir] contacto', cause);
    }
    await perform(updated, medium, effectiveContact(updated, customers.map((customer) => (customer.id === record?.id ? { ...customer, ...patch } : customer))));
  }, [customers, perform, updateCustomer, updateQuotationContact]);

  const revealFile = useCallback(async (path: string) => {
    const invoke = nativeInvoke();
    if (!invoke) return;
    try {
      await revealInFolder(invoke, path);
    } catch (cause) {
      console.error('[compartir] carpeta', cause);
      toast.error({ title: 'No se pudo abrir la carpeta', description: 'Busca el PDF en la carpeta de datos de la app, dentro de «enviados».' });
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

  const api = useMemo<ShareApi>(() => ({ shareQuotation, offerAfterSave, canUse, busy }), [shareQuotation, offerAfterSave, canUse, busy]);

  return (
    <ShareContext.Provider value={api}>
      {children}
      <ShareDialogs
        flow={flow}
        busy={busy}
        canUse={canUse}
        contactOf={(quotation) => effectiveContact(quotation, customers)}
        onClose={() => setFlow(null)}
        onShare={shareQuotation}
        onSaveAndSend={(quotation, medium, value) => void saveContactAndSend(quotation, medium, value)}
        onReveal={(path) => void revealFile(path)}
        onOpenGmail={(state) => void openInGmail(state)}
      />
    </ShareContext.Provider>
  );
}

export function useShareQuotation(): ShareApi {
  const context = useContext(ShareContext);
  if (!context) throw new Error('useShareQuotation debe usarse dentro de ShareProvider');
  return context;
}
