import { useId, useLayoutEffect, useRef, useState } from 'react';
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
import { useConfirm } from '../hooks/useConfirm';
import { DEFAULT_MESSAGE_TEMPLATE, EXAMPLE_VALUES, MESSAGE_VARIABLES, buildShareSubject, previewMessage } from '../services/shareMessage';
import { applyDatos, insertAtCursor, toFormValues, validateWorkshopForm } from '../services/workshopForm';
import type { WorkshopFormErrors, WorkshopFormValues } from '../services/workshopForm';
import '../styles/respaldo.css';

/** The counter only appears when the message nears the limit. */
const MESSAGE_COUNTER_FROM = 700;

export function WorkshopPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const ids = { nombre: useId(), telefono: useId(), calle: useId(), colonia: useId(), correo: useId() };
  const pageRef = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState<BusinessInfo>(loadBusinessInfo);
  const [values, setValues] = useState<WorkshopFormValues>(() => toFormValues(base));
  const [errors, setErrors] = useState<WorkshopFormErrors>({});
  const messageId = useId();
  const messageCounterId = `${messageId}-counter`;
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const message = values.mensaje;
  const messageDirty = message.trim() !== (base.mensajeClientes ?? DEFAULT_MESSAGE_TEMPLATE);
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

  function handleSaveMessage() {
    if (messageTooLong) return;
    // The default text is stored as "no custom message", so a future change of the default reaches this workshop.
    const custom = message.trim() === DEFAULT_MESSAGE_TEMPLATE || message.trim() === '' ? undefined : message;
    try {
      const { mensajeClientes: _previous, ...rest } = base;
      const saved = saveBusinessInfo(custom ? { ...rest, mensajeClientes: custom } : rest);
      setBase(saved);
      setMessage(saved.mensajeClientes ?? DEFAULT_MESSAGE_TEMPLATE);
      toast.success({ title: 'Mensaje guardado', description: 'Se usará al enviar cotizaciones por WhatsApp o correo.' });
    } catch {
      toast.error({ title: 'No se pudo guardar', description: 'El almacenamiento está lleno o no está disponible. Tu mensaje anterior no se modificó.' });
    }
  }

  const update = (key: keyof WorkshopFormErrors, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  function handleSave() {
    const found = validateWorkshopForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error({ title: 'Revisa los datos', description: 'Corrige los campos marcados para guardar.' });
      window.requestAnimationFrame(() => focusFirstInvalid(pageRef.current ?? document));
      return;
    }
    try {
      const saved = saveBusinessInfo(applyDatos(values, base));
      setBase(saved);
      setValues((current) => ({ ...toFormValues(saved), mensaje: current.mensaje }));
      toast.success({ title: 'Datos del taller guardados', description: 'Las próximas cotizaciones en PDF usarán estos datos.' });
    } catch {
      toast.error({ title: 'No se pudo guardar', description: 'El almacenamiento está lleno o no está disponible. Tus datos anteriores no se modificaron.' });
    }
  }

  async function handleResetMessage() {
    const accepted = await confirm({
      title: '¿Restablecer el mensaje original?',
      description: 'El texto del editor volverá al mensaje que trae la app. No se guarda hasta que pulses Guardar mensaje.',
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
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-5 pb-10 pt-6 sm:px-8">
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
          <button type="button" data-testid="taller-save" className="mac-btn mac-btn-primary" onClick={handleSave}>Guardar</button>
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
          <button type="button" data-testid="taller-mensaje-save" className="mac-btn mac-btn-primary" disabled={!messageDirty || messageTooLong} onClick={handleSaveMessage}>Guardar mensaje</button>
        </div>
      </Card>
    </div>
  </div>;
}
