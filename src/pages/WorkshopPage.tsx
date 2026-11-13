import { useEffect, useId, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { focusFirstInvalid } from '../utils/focusFirstInvalid';
import { Store } from 'lucide-react';
import { Card } from '../components/newQuote/primitives/Card';
import { CardHeader } from '../components/newQuote/primitives/CardHeader';
import { MessageCard } from '../components/taller/MessageCard';
import { FormRow, describedByFor } from '../components/newQuote/primitives/FormRow';
import { EmailInput } from '../components/ui/EmailInput';
import { PhoneInput } from '../components/ui/PhoneInput';
import { useToast } from '../components/ui/Toast';
import {
  MESSAGE_MAX, loadBusinessInfo, resetBusinessInfo, saveBusinessInfo,
} from '../config/businessInfo';
import type { BusinessInfo } from '../config/businessInfo';
import { useChoose, useConfirm } from '../hooks/useConfirm';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { userMessage } from '../utils/userMessage';
import {
  DEFAULT_INVOICE_MESSAGE_TEMPLATE, DEFAULT_MESSAGE_TEMPLATE, EXAMPLE_VALUES, INVOICE_EXAMPLE_VALUES, INVOICE_MESSAGE_VARIABLES, MESSAGE_VARIABLES,
  buildInvoiceShareSubject, buildShareSubject, previewInvoiceMessage, previewMessage,
} from '../services/shareMessage';
import { buildSaveCandidate, changedSections, isDirty, saveToastCopy, shouldBlockNavigation, toFormValues, validateWorkshopForm } from '../services/workshopForm';
import type { WorkshopFormErrors, WorkshopFormValues } from '../services/workshopForm';
import '../styles/respaldo.css';

export function WorkshopPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const choose = useChoose();
  const ids = { nombre: useId(), telefono: useId(), calle: useId(), colonia: useId(), correo: useId() };
  const pageRef = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState<BusinessInfo>(loadBusinessInfo);
  const [values, setValues] = useState<WorkshopFormValues>(() => toFormValues(base));
  const [errors, setErrors] = useState<WorkshopFormErrors>({});
  const dirty = isDirty(toFormValues(base), values);
  // Refs mirror the latest state so async flows (dialog, blocker) never act on stale closures.
  const baseRef = useRef(base);
  const valuesRef = useRef(values);
  const dirtyRef = useRef(dirty);
  baseRef.current = base;
  valuesRef.current = values;
  dirtyRef.current = dirty;
  const askToLeaveRef = useRef<() => Promise<boolean>>(async () => true);
  useUnsavedGuard(dirty, () => askToLeaveRef.current());
  const setMessage = (mensaje: string) => setValues((current) => ({ ...current, mensaje }));
  const setInvoiceMessage = (mensajeFacturas: string) => setValues((current) => ({ ...current, mensajeFacturas }));

  const update = (key: keyof WorkshopFormErrors, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  /** One atomic write of data + message. Returns false (showing only the field errors) when the form is invalid or the write fails. */
  async function save(): Promise<boolean> {
    const current = valuesRef.current;
    const found = validateWorkshopForm(current);
    setErrors(found);
    if (Object.keys(found).length > 0 || current.mensaje.length > MESSAGE_MAX || current.mensajeFacturas.length > MESSAGE_MAX) {
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

  askToLeaveRef.current = askToLeave;


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

  async function confirmResetMessage(): Promise<boolean> {
    return confirm({
      title: '¿Restablecer el mensaje original?',
      description: 'El texto del editor volverá al mensaje que trae la app. No se guarda hasta que pulses Guardar cambios.',
      confirmLabel: 'Restablecer',
    });
  }

  async function handleResetMessage() {
    if (await confirmResetMessage()) setMessage(DEFAULT_MESSAGE_TEMPLATE);
  }

  async function handleResetInvoiceMessage() {
    if (await confirmResetMessage()) setInvoiceMessage(DEFAULT_INVOICE_MESSAGE_TEMPLATE);
  }

  async function handleReset() {
    const accepted = await confirm({
      title: '¿Restablecer los datos originales?',
      description: 'Los datos del taller y los mensajes volverán a los que traía la app. Los PDF ya generados no cambian.',
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
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-5 pt-6 sm:px-8" style={{ paddingBottom: 40 }}>
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
      <MessageCard
        testBase="taller"
        title="Mensaje para cotizaciones"
        subtitle="Texto que acompaña la cotización al enviarla por WhatsApp o correo."
        value={values.mensaje}
        onChange={setMessage}
        variables={MESSAGE_VARIABLES}
        defaultTemplate={DEFAULT_MESSAGE_TEMPLATE}
        preview={previewMessage(values.mensaje)}
        previewSubject={buildShareSubject(EXAMPLE_VALUES.folio, EXAMPLE_VALUES.taller)}
        onReset={() => void handleResetMessage()}
      />
      <MessageCard
        testBase="taller-facturas"
        title="Mensaje para facturas"
        subtitle="Texto que acompaña la factura al enviarla por WhatsApp o correo."
        value={values.mensajeFacturas}
        onChange={setInvoiceMessage}
        variables={INVOICE_MESSAGE_VARIABLES}
        defaultTemplate={DEFAULT_INVOICE_MESSAGE_TEMPLATE}
        preview={previewInvoiceMessage(values.mensajeFacturas)}
        previewSubject={buildInvoiceShareSubject(42, INVOICE_EXAMPLE_VALUES.taller)}
        onReset={() => void handleResetInvoiceMessage()}
      />
    </div>
    <div className="taller-actions">
      <button type="button" data-testid="taller-discard" className="mac-btn mac-btn-secondary" disabled={!dirty} onClick={discard}>Descartar</button>
      <button type="button" data-testid="taller-save" className="mac-btn mac-btn-primary" disabled={!dirty} onClick={() => void save()}>Guardar cambios</button>
    </div>
  </div>;
}
