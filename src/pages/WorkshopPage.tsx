import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { focusFirstInvalid } from '../utils/focusFirstInvalid';
import { MessageSquareText, Store } from 'lucide-react';
import { Card } from '../components/newQuote/primitives/Card';
import { CardHeader } from '../components/newQuote/primitives/CardHeader';
import { FormRow, describedByFor } from '../components/newQuote/primitives/FormRow';
import { EmailInput } from '../components/ui/EmailInput';
import { PhoneInput } from '../components/ui/PhoneInput';
import { useToast } from '../components/ui/Toast';
import {
  MESSAGE_MAX, loadBusinessInfo, resetBusinessInfo, saveBusinessInfo,
} from '../config/businessInfo';
import type { BusinessInfo } from '../config/businessInfo';
import { useChoose, useConfirm } from '../hooks/useConfirm';
import { useShortcut } from '../hooks/useShortcuts';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { userMessage } from '../utils/userMessage';
import { DEFAULT_MESSAGE_TEMPLATE, EXAMPLE_VALUES, MESSAGE_VARIABLES, buildShareSubject, previewMessage } from '../services/shareMessage';
import { buildSaveCandidate, changedSections, insertAtCursor, isDirty, saveToastCopy, shouldBlockNavigation, toFormValues, validateWorkshopForm } from '../services/workshopForm';
import type { WorkshopFormErrors, WorkshopFormValues } from '../services/workshopForm';
import '../styles/respaldo.css';

/** The counter only appears when the message nears the limit. */
const MESSAGE_COUNTER_FROM = 700;

export function WorkshopPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const choose = useChoose();
  const ids = { nombre: useId(), telefono: useId(), calle: useId(), colonia: useId(), correo: useId() };
  const pageRef = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState<BusinessInfo>(loadBusinessInfo);
  const [values, setValues] = useState<WorkshopFormValues>(() => toFormValues(base));
  const [errors, setErrors] = useState<WorkshopFormErrors>({});
  const messageId = useId();
  const messageCounterId = `${messageId}-counter`;
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const message = values.mensaje;
  const dirty = isDirty(toFormValues(base), values);
  // Refs mirror the latest state so async flows (dialog, blocker, shortcut) never act on stale closures.
  const baseRef = useRef(base);
  const valuesRef = useRef(values);
  const dirtyRef = useRef(dirty);
  baseRef.current = base;
  valuesRef.current = values;
  dirtyRef.current = dirty;
  useUnsavedGuard(dirty);
  const messageTooLong = message.length > MESSAGE_MAX;
  const [previewMode, setPreviewMode] = useState<'whatsapp' | 'correo'>('whatsapp');
  const preview = previewMessage(message);
  const setMessage = (mensaje: string | ((current: string) => string)) => setValues((current) => ({ ...current, mensaje: typeof mensaje === 'function' ? mensaje(current.mensaje) : mensaje }));

  // The caret is restored after React re-renders the controlled textarea (which would otherwise move it to the end).
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    const area = messageRef.current;
    pendingCaret.current = null;
    if (caret === null || !area) return;
    area.focus();
    area.setSelectionRange(caret, caret);
  }, [values.mensaje]);

  function insertVariable(key: string) {
    const area = messageRef.current;
    const result = insertAtCursor(message, area?.selectionStart ?? message.length, area?.selectionEnd ?? message.length, `{${key}}`);
    pendingCaret.current = result.caret;
    setMessage(result.text);
  }

  const update = (key: keyof WorkshopFormErrors, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  /** One atomic write of data + message. Returns false (showing only the field errors) when the form is invalid or the write fails. */
  async function save(): Promise<boolean> {
    const current = valuesRef.current;
    const found = validateWorkshopForm(current);
    setErrors(found);
    if (Object.keys(found).length > 0 || current.mensaje.length > MESSAGE_MAX) {
      window.requestAnimationFrame(() => focusFirstInvalid(pageRef.current ?? document));
      return false;
    }
    try {
      const sections = changedSections(toFormValues(baseRef.current), current);
      const saved = saveBusinessInfo(buildSaveCandidate(current, baseRef.current));
      // Refs first: a blocked navigation proceeds right after this and must already see a clean form.
      baseRef.current = saved;
      dirtyRef.current = false;
      setBase(saved);
      setValues(toFormValues(saved));
      toast.success(saveToastCopy(sections));
      return true;
    } catch (error) {
      toast.error({ title: 'No se pudo guardar', description: userMessage(error, 'taller-guardar') });
      return false;
    }
  }

  function discard() {
    const original = toFormValues(baseRef.current);
    valuesRef.current = original;
    dirtyRef.current = false;
    setValues(original);
    setErrors({});
  }

  /** Asks what to do with unsaved changes. Resolves true when it is fine to leave (saved or discarded). */
  async function askToLeave(): Promise<boolean> {
    const choice = await choose({
      icon: 'save',
      title: '¿Guardar los cambios?',
      description: 'Cambiaste los datos del taller. Si sales sin guardar, se perderán.',
      confirmLabel: 'Guardar',
      secondaryLabel: 'Descartar',
      cancelLabel: 'Seguir editando',
    });
    if (choice === 'primary') return save();
    if (choice === 'secondary') {
      discard();
      return true;
    }
    return false;
  }

  useShortcut('save', () => { if (dirtyRef.current) void save(); });

  const blocker = useBlocker(({ currentLocation, nextLocation }) => shouldBlockNavigation(dirtyRef.current, currentLocation, nextLocation));
  const askingRef = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || askingRef.current) return;
    askingRef.current = true;
    void askToLeave().then((canLeave) => {
      askingRef.current = false;
      if (canLeave) blocker.proceed();
      else blocker.reset();
    });
    // askToLeave reads everything through refs, so only the blocker state drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);

  async function handleResetMessage() {
    const accepted = await confirm({
      title: '¿Restablecer el mensaje original?',
      description: 'El texto del editor volverá al mensaje que trae la app. No se guarda hasta que pulses Guardar cambios.',
      confirmLabel: 'Restablecer',
    });
    if (accepted) setMessage(DEFAULT_MESSAGE_TEMPLATE);
  }

  async function handleReset() {
    const accepted = await confirm({
      title: '¿Restablecer los datos originales?',
      description: 'Los datos del taller y el mensaje volverán a los que traía la app. Los PDF ya generados no cambian.',
      confirmLabel: 'Restablecer',
    });
    if (!accepted) return;
    const defaults = resetBusinessInfo();
    setBase(defaults);
    setValues(toFormValues(defaults));
    setErrors({});
    toast.success({ title: 'Valores originales restablecidos', description: 'Se usan los datos que traía la app.' });
  }

  return <div ref={pageRef} className="respaldo-page">
    <h1 className="sr-only">Datos del taller</h1>
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-5 pt-6 sm:px-8" style={{ paddingBottom: dirty ? 96 : 40 }}>
      <Card as="section">
        <CardHeader icon={<Store size={18} />} title="Datos del taller" subtitle="Aparecen en el encabezado y el pie de la cotización en PDF." />
        <FormRow label="Nombre" htmlFor={ids.nombre} required error={errors.nombre}>
          <input id={ids.nombre} data-testid="taller-nombre" className="mac-row-input" aria-required="true" aria-invalid={Boolean(errors.nombre)} aria-describedby={describedByFor(ids.nombre, errors.nombre)} value={values.nombre} maxLength={40} onChange={(event) => update('nombre', event.target.value)} />
        </FormRow>
        <FormRow label="Teléfono" htmlFor={ids.telefono} required error={errors.telefono}>
          <PhoneInput id={ids.telefono} data-testid="taller-telefono" className="mac-row-input" aria-required="true" aria-invalid={Boolean(errors.telefono)} aria-describedby={describedByFor(ids.telefono, errors.telefono)} value={values.telefono} onValueChange={(value) => update('telefono', value)} />
        </FormRow>
        <FormRow label="Calle y número" htmlFor={ids.calle} required error={errors.calle}>
          <input id={ids.calle} data-testid="taller-calle" className="mac-row-input" autoComplete="street-address" aria-required="true" aria-invalid={Boolean(errors.calle)} aria-describedby={describedByFor(ids.calle, errors.calle)} value={values.calle} onChange={(event) => update('calle', event.target.value.replace(/[\r\n]+/g, ' '))} />
        </FormRow>
        <FormRow label="Colonia y ciudad" htmlFor={ids.colonia} required error={errors.colonia}>
          <input id={ids.colonia} data-testid="taller-colonia" className="mac-row-input" aria-required="true" aria-invalid={Boolean(errors.colonia)} aria-describedby={describedByFor(ids.colonia, errors.colonia)} value={values.colonia} onChange={(event) => update('colonia', event.target.value.replace(/[\r\n]+/g, ' '))} />
        </FormRow>
        <FormRow label="Correo" htmlFor={ids.correo} error={errors.correo}>
          <EmailInput id={ids.correo} data-testid="taller-correo" className="mac-row-input" anchorSelector=".mac-row" aria-invalid={Boolean(errors.correo)} aria-describedby={describedByFor(ids.correo, errors.correo)} value={values.correo} onValueChange={(value) => update('correo', value)} />
        </FormRow>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button type="button" data-testid="taller-reset" className="taller-link" onClick={() => void handleReset()}>Restablecer valores originales</button>
        </div>
      </Card>
      <Card as="section">
        <CardHeader icon={<MessageSquareText size={18} />} title="Mensaje para clientes" subtitle="Texto que acompaña la cotización al enviarla por WhatsApp o correo." />
        <div className="px-4 pb-2">
          <label htmlFor={messageId} className="sr-only">Mensaje para clientes</label>
          <textarea ref={messageRef} id={messageId} data-testid="taller-mensaje" rows={6} className="w-full resize-y rounded-lg border border-mac-separator bg-white px-3 py-2 text-sm leading-5 text-mac-ink" aria-invalid={messageTooLong} aria-describedby={messageCounterId} value={message} onChange={(event) => setMessage(event.target.value)} />
          {message.length > MESSAGE_COUNTER_FROM && <p id={messageCounterId} data-testid="taller-mensaje-contador" role={messageTooLong ? 'alert' : undefined} className={`mt-1 text-right text-[12px] ${messageTooLong ? 'font-medium text-mac-danger' : 'text-mac-ink-2'}`}>{message.length} / {MESSAGE_MAX}{messageTooLong ? ' · Reduce el mensaje para guardarlo.' : ''}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Variables disponibles">
            {MESSAGE_VARIABLES.map((variable) => (
              <button key={variable.key} type="button" title={variable.description} data-testid={`taller-variable-${variable.key}`} className="rounded-md bg-mac-tint px-2 py-1 text-[12px] font-medium text-mac-accent-text" onMouseDown={(event) => event.preventDefault()} onClick={() => insertVariable(variable.key)}>{`{${variable.key}}`}</button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-mac-ink-2">Toca para insertar</p>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-mac-separator px-4 pt-3">
          <p className="text-[13px] text-mac-ink-2">Vista previa con datos de ejemplo</p>
          <div className="mac-segment flex" role="group" aria-label="Formato de la vista previa">
            <button type="button" data-testid="taller-preview-whatsapp" aria-pressed={previewMode === 'whatsapp'} onClick={() => setPreviewMode('whatsapp')}>WhatsApp</button>
            <button type="button" data-testid="taller-preview-correo" aria-pressed={previewMode === 'correo'} onClick={() => setPreviewMode('correo')}>Correo</button>
          </div>
        </div>
        <div data-testid="taller-mensaje-preview" data-mode={previewMode} className="px-4 pb-3 pt-3" aria-live="polite">
          {previewMode === 'whatsapp'
            ? <div className="taller-bubble">{preview}</div>
            : <div className="taller-mail">
              <p className="taller-mail-subject"><span>Asunto</span>{buildShareSubject(EXAMPLE_VALUES.folio, EXAMPLE_VALUES.taller)}</p>
              <div className="taller-mail-body">{preview}</div>
            </div>}
        </div>
        <div className="flex items-center justify-between gap-3 px-4 pb-3">
          <button type="button" data-testid="taller-mensaje-reset" className="taller-link" disabled={message === DEFAULT_MESSAGE_TEMPLATE} onClick={() => void handleResetMessage()}>Restablecer mensaje original</button>
        </div>
      </Card>
    </div>
    {dirty && <div role="region" aria-label="Cambios sin guardar" data-testid="taller-savebar" className="taller-savebar">
      <span className="taller-savebar-dot" aria-hidden="true" />
      <p className="taller-savebar-text">Tienes cambios sin guardar</p>
      <button type="button" data-testid="taller-discard" className="taller-link" onClick={discard}>Descartar</button>
      <button type="button" data-testid="taller-save" className="mac-btn mac-btn-primary" onClick={() => void save()}>Guardar cambios</button>
    </div>}
  </div>;
}
