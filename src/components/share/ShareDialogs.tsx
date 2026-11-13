import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { FolderOpen, Loader2, Mail, MessageCircle } from 'lucide-react';
import { Button } from '../Button';
import { EmailInput } from '../ui/EmailInput';
import { FieldError, errorIdFor } from '../ui/FieldError';
import { PhoneInput } from '../ui/PhoneInput';
import type { Quotation, ShareMedium } from '../../models/quotation';
import { hasEmailMedium, MEDIUM_LABEL, otherMedium } from '../../services/shareQuotation';
import type { ShareContact } from '../../services/shareQuotation';
import { formatPhone, normalizeEmail, validateEmail, validatePhone } from '../../validation/fields';

/** Result of one share attempt, shown in the persistent sheet. */
export interface ShareDoneState {
  quotation: Quotation;
  medium: ShareMedium;
  contact: ShareContact;
  message: { subject: string; text: string };
  /** Saved PDF (native app only). */
  path: string | null;
  native: boolean;
  clipboardOk: boolean;
  /** The app managed to launch WhatsApp / the mail client. */
  opened: boolean;
}

type DialogFlow =
  | null
  | { step: 'saved'; quotation: Quotation }
  | { step: 'missing'; quotation: Quotation; medium: ShareMedium }
  | ({ step: 'done' } & ShareDoneState);

interface ShareDialogsProps {
  flow: DialogFlow;
  busy: boolean;
  canUse: (quotation: Quotation, medium: ShareMedium) => boolean;
  contactOf: (quotation: Quotation) => ShareContact;
  onClose: () => void;
  onShare: (quotation: Quotation, medium: ShareMedium) => void;
  onSaveAndSend: (quotation: Quotation, medium: ShareMedium, value: string) => void;
  onReveal: (path: string) => void;
  onOpenGmail: (state: ShareDoneState) => void;
}

export function ShareDialogs({ flow, busy, canUse, contactOf, onClose, onShare, onSaveAndSend, onReveal, onOpenGmail }: ShareDialogsProps) {
  if (!flow) return null;
  if (flow.step === 'saved') return <SavedSheet key="saved" quotation={flow.quotation} busy={busy} canUse={canUse} onClose={onClose} onShare={onShare} />;
  if (flow.step === 'missing') {
    return <MissingContactDialog key={`missing-${flow.medium}`} quotation={flow.quotation} medium={flow.medium} initial={contactOf(flow.quotation)} alternative={canUse(flow.quotation, otherMedium(flow.medium)) ? otherMedium(flow.medium) : null} busy={busy} onClose={onClose} onShare={onShare} onSaveAndSend={onSaveAndSend} />;
  }
  return <DoneSheet key="done" state={flow} onClose={onClose} onReveal={onReveal} onOpenGmail={onOpenGmail} />;
}

// ---- Shared shell ----------------------------------------------------------------------------------------------

/** Native modal <dialog>: it stacks above the PDF preview (also a modal <dialog>) and toasts render inside it. */
function Sheet({ labelId, busy = false, onClose, children }: { labelId: string; busy?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelId}
      data-testid="share-sheet"
      onCancel={(event) => { if (busy) event.preventDefault(); }}
      onClose={onClose}
      className="m-auto w-[min(92vw,460px)] max-w-none rounded-2xl border-0 bg-white p-6 text-slate-800 shadow-2xl backdrop:bg-navy-950/60"
    >
      {children}
    </dialog>
  );
}

function MediumIcon({ medium, size = 16 }: { medium: ShareMedium; size?: number }) {
  return medium === 'whatsapp' ? <MessageCircle size={size} aria-hidden="true" /> : <Mail size={size} aria-hidden="true" />;
}

// ---- After saving ----------------------------------------------------------------------------------------------

function SavedSheet({ quotation, busy, canUse, onClose, onShare }: { quotation: Quotation; busy: boolean; canUse: ShareDialogsProps['canUse']; onClose: () => void; onShare: ShareDialogsProps['onShare'] }) {
  const titleId = useId();
  return (
    <Sheet labelId={titleId} busy={busy} onClose={onClose}>
      <h2 id={titleId} className="text-lg font-bold text-navy-950">Cotización {quotation.folio} guardada</h2>
      <p className="mt-1 text-sm text-slate-500">¿Quieres enviársela ahora a {quotation.customer.name}?</p>
      <div className="mt-5 flex flex-col gap-2">
        {(['whatsapp', 'email'] as const).map((medium) => (
          <ShareButton key={medium} medium={medium} active={canUse(quotation, medium)} busy={busy} onClick={() => onShare(quotation, medium)} />
        ))}
        <Button variant="ghost" disabled={busy} data-testid="share-later" onClick={onClose}>Ahora no</Button>
      </div>
    </Sheet>
  );
}

/** Secondary button for "Enviar por …". Without that medium it looks inactive but still opens the "add it" dialog. */
export function ShareButton({ medium, active, busy = false, onClick, className = '' }: { medium: ShareMedium; active: boolean; busy?: boolean; onClick: () => void; className?: string }) {
  const label = medium === 'whatsapp' ? 'Enviar por WhatsApp' : 'Enviar por correo';
  return (
    <Button
      variant="secondary"
      disabled={busy}
      data-testid={`share-${medium}`}
      data-available={active ? 'true' : 'false'}
      title={active ? undefined : medium === 'whatsapp' ? 'Sin teléfono registrado: te lo pediremos.' : 'Sin correo registrado: te lo pediremos.'}
      icon={busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <MediumIcon medium={medium} />}
      className={`${active ? '' : 'text-slate-400'} ${className}`}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

// ---- Missing contact -------------------------------------------------------------------------------------------

interface MissingProps {
  quotation: Quotation;
  medium: ShareMedium;
  initial: ShareContact;
  alternative: ShareMedium | null;
  busy: boolean;
  onClose: () => void;
  onShare: ShareDialogsProps['onShare'];
  onSaveAndSend: ShareDialogsProps['onSaveAndSend'];
}

function validateMissing(medium: ShareMedium, value: string): string {
  if (medium === 'whatsapp') return validatePhone(value, true).mensaje ?? '';
  if (!normalizeEmail(value)) return 'Escribe un correo.';
  const result = validateEmail(value);
  if (!result.ok) return result.mensaje ?? 'Escribe un correo válido.';
  return hasEmailMedium({ phone: '', email: value }) ? '' : 'Usa un correo sin acentos ni caracteres especiales.';
}

function MissingContactDialog({ quotation, medium, initial, alternative, busy, onClose, onShare, onSaveAndSend }: MissingProps) {
  const titleId = useId();
  const fieldId = useId();
  const [value, setValue] = useState(() => (medium === 'whatsapp' ? formatPhone(initial.phone) : initial.email));
  const [error, setError] = useState('');

  function submit() {
    const found = validateMissing(medium, value);
    setError(found);
    if (!found) onSaveAndSend(quotation, medium, value);
  }

  const noun = medium === 'whatsapp' ? 'teléfono' : 'correo';
  const onEnter = (event: KeyboardEvent) => { if (event.key === 'Enter' && !event.defaultPrevented) { event.preventDefault(); submit(); } };
  const common = {
    id: fieldId,
    'data-testid': `share-${medium}-input`,
    className: 'h-10 w-full rounded-lg border border-slate-200 px-3 text-sm',
    'aria-invalid': Boolean(error),
    'aria-describedby': errorIdFor(fieldId, error),
    disabled: busy,
  };

  return (
    <Sheet labelId={titleId} busy={busy} onClose={onClose}>
      <h2 id={titleId} className="text-lg font-bold text-navy-950">{quotation.customer.name} no tiene {noun} registrado</h2>
      <p className="mt-1 text-sm text-slate-500">
        {medium === 'whatsapp' ? 'Escribe su teléfono de 10 dígitos para abrir WhatsApp con la cotización.' : 'Escribe su correo para abrir tu correo con la cotización.'}
      </p>
      <div className="mt-4">
        <label htmlFor={fieldId} className="mb-1 block text-xs font-medium text-slate-500">{medium === 'whatsapp' ? 'Teléfono' : 'Correo'}</label>
        {medium === 'whatsapp'
          ? <PhoneInput {...common} onKeyDown={onEnter} autoFocus placeholder="(667) 123-4567" value={value} onValueChange={(next) => { setValue(next); setError(''); }} />
          : <EmailInput {...common} onKeyDown={onEnter} autoFocus placeholder="nombre@dominio.com" value={value} onValueChange={(next) => { setValue(next); setError(''); }} />}
        <FieldError id={`${fieldId}-error`} message={error} className="pt-1" />
      </div>
      <p className="mt-2 text-xs text-slate-400">Se guardará en los datos del cliente.</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {alternative
          ? <button type="button" data-testid="share-instead" disabled={busy} className="text-sm font-medium text-mac-accent-text underline-offset-2 hover:underline disabled:opacity-50" onClick={() => onShare(quotation, alternative)}>Enviar por {MEDIUM_LABEL[alternative]} en su lugar</button>
          : <span />}
        <div className="flex gap-2">
          <Button variant="secondary" disabled={busy} data-testid="share-cancel" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={busy} data-testid="share-save-send" icon={busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : undefined} onClick={submit}>Guardar y enviar</Button>
        </div>
      </div>
    </Sheet>
  );
}

// ---- Result ----------------------------------------------------------------------------------------------------

function doneText(state: ShareDoneState): string {
  const { medium, opened, native, clipboardOk, quotation } = state;
  const name = quotation.customer.name;
  if (!opened) {
    return native
      ? `No se pudo abrir ${medium === 'whatsapp' ? 'WhatsApp' : 'tu correo'}. El PDF quedó guardado: muéstralo en la carpeta y envíalo a mano.`
      : 'No se pudo abrir la ventana de envío. El PDF se descargó: adjúntalo a mano.';
  }
  if (!native) {
    return medium === 'whatsapp'
      ? `Se abrió WhatsApp con ${name}. El PDF se descargó: adjúntalo desde tus descargas y presiona Enviar.`
      : 'Se abrió tu correo. El PDF se descargó: adjúntalo desde tus descargas.';
  }
  if (!clipboardOk) {
    return medium === 'whatsapp'
      ? `Se abrió WhatsApp con ${name}. No se pudo copiar el PDF: arrástralo desde la carpeta y presiona Enviar.`
      : 'Se abrió tu correo. No se pudo copiar el PDF: arrástralo desde la carpeta.';
  }
  return medium === 'whatsapp'
    ? `Se abrió WhatsApp con ${name}. Presiona Ctrl+V para adjuntar el PDF y luego Enviar.`
    : 'Se abrió tu correo. Pega el PDF con Ctrl+V o arrástralo desde la carpeta.';
}

function DoneSheet({ state, onClose, onReveal, onOpenGmail }: { state: ShareDoneState; onClose: () => void; onReveal: ShareDialogsProps['onReveal']; onOpenGmail: ShareDialogsProps['onOpenGmail'] }) {
  const titleId = useId();
  return (
    <Sheet labelId={titleId} onClose={onClose}>
      <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-navy-950">
        <MediumIcon medium={state.medium} size={18} />
        {state.opened ? 'Casi listo' : 'No se pudo abrir el envío'}
      </h2>
      <p data-testid="share-done-text" className="mt-2 text-sm text-slate-600">{doneText(state)}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {state.path && (
          <Button variant="secondary" data-testid="share-reveal" icon={<FolderOpen size={16} aria-hidden="true" />} onClick={() => onReveal(state.path as string)}>Mostrar archivo en la carpeta</Button>
        )}
        {state.medium === 'email' && (
          <Button variant="secondary" data-testid="share-gmail" icon={<Mail size={16} aria-hidden="true" />} onClick={() => onOpenGmail(state)}>Abrir en Gmail</Button>
        )}
        <Button variant="primary" data-testid="share-done" onClick={onClose}>Listo</Button>
      </div>
    </Sheet>
  );
}
