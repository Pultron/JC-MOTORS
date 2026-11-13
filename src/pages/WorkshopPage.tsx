import { useId, useRef, useState } from 'react';
import { MessageSquareText, Store } from 'lucide-react';
import { Card } from '../components/newQuote/primitives/Card';
import { CardHeader } from '../components/newQuote/primitives/CardHeader';
import { FormRow, describedByFor } from '../components/newQuote/primitives/FormRow';
import { PhoneInput } from '../components/ui/PhoneInput';
import { useToast } from '../components/ui/Toast';
import {
  MESSAGE_MAX, loadBusinessInfo, resetBusinessInfo, saveBusinessInfo, validateBusinessInfo,
} from '../config/businessInfo';
import type { BusinessInfo, BusinessInfoErrors } from '../config/businessInfo';
import { useConfirm } from '../hooks/useConfirm';
import { DEFAULT_MESSAGE_TEMPLATE, MESSAGE_VARIABLES, previewMessage } from '../services/shareMessage';
import '../styles/respaldo.css';

interface FormState {
  nombre: string;
  telefono: string;
  direccion: string;
  correo: string;
}

const toForm = (info: BusinessInfo): FormState => ({
  nombre: info.nombre,
  telefono: info.telefonos[0] ?? '',
  direccion: info.direccion,
  correo: info.correo ?? '',
});

/** The form edits the primary phone; any additional stored phones are kept as they are. */
const toInfo = (form: FormState, base: BusinessInfo): BusinessInfo => ({
  ...base,
  nombre: form.nombre,
  telefonos: [form.telefono, ...base.telefonos.slice(1)],
  direccion: form.direccion,
  correo: form.correo,
});

export function WorkshopPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const ids = { nombre: useId(), telefono: useId(), direccion: useId(), correo: useId() };
  const [base, setBase] = useState<BusinessInfo>(loadBusinessInfo);
  const [form, setForm] = useState<FormState>(() => toForm(base));
  const [errors, setErrors] = useState<BusinessInfoErrors>({});
  const messageId = useId();
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState(() => base.mensajeClientes ?? DEFAULT_MESSAGE_TEMPLATE);
  const messageDirty = message.trim() !== (base.mensajeClientes ?? DEFAULT_MESSAGE_TEMPLATE);
  const messageTooLong = message.length > MESSAGE_MAX;

  function insertVariable(key: string) {
    const area = messageRef.current;
    const token = `{${key}}`;
    const start = area?.selectionStart ?? message.length;
    const end = area?.selectionEnd ?? message.length;
    setMessage((current) => (current.slice(0, start) + token + current.slice(end)).slice(0, MESSAGE_MAX + token.length));
    window.requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + token.length, start + token.length);
    });
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

  const update = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  function handleSave() {
    const candidate = toInfo(form, base);
    const found = validateBusinessInfo(candidate);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error({ title: 'Revisa los datos', description: 'Corrige los campos marcados para guardar.' });
      return;
    }
    try {
      const saved = saveBusinessInfo(candidate);
      setBase(saved);
      setForm(toForm(saved));
      toast.success({ title: 'Datos del taller guardados', description: 'Las próximas cotizaciones en PDF usarán estos datos.' });
    } catch {
      toast.error({ title: 'No se pudo guardar', description: 'El almacenamiento está lleno o no está disponible. Tus datos anteriores no se modificaron.' });
    }
  }

  async function handleReset() {
    const accepted = await confirm({
      title: '¿Restablecer valores originales?',
      description: 'Los datos del taller volverán a los que traía la app. Los PDF ya generados no cambian.',
      confirmLabel: 'Restablecer',
    });
    if (!accepted) return;
    const defaults = resetBusinessInfo();
    setBase(defaults);
    setForm(toForm(defaults));
    setMessage(DEFAULT_MESSAGE_TEMPLATE);
    setErrors({});
    toast.success({ title: 'Valores originales restablecidos', description: 'Se usan los datos que traía la app.' });
  }

  return <div className="respaldo-page">
    <h1 className="sr-only">Datos del taller</h1>
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-5 pb-10 pt-6 sm:px-8">
      <Card as="section">
        <CardHeader icon={<Store size={18} />} title="Datos del taller" subtitle="Aparecen en el encabezado y el pie de la cotización en PDF." />
        <FormRow label="Nombre" htmlFor={ids.nombre} required error={errors.nombre}>
          <input id={ids.nombre} data-testid="taller-nombre" className="mac-row-input" aria-required="true" aria-invalid={Boolean(errors.nombre)} value={form.nombre} maxLength={40} onChange={(event) => update('nombre', event.target.value)} />
        </FormRow>
        <FormRow label="Teléfono" htmlFor={ids.telefono} required error={errors.telefono}>
          <PhoneInput id={ids.telefono} data-testid="taller-telefono" className="mac-row-input" aria-required="true" aria-invalid={Boolean(errors.telefono)} value={form.telefono} onValueChange={(value) => update('telefono', value)} />
        </FormRow>
        <FormRow label="Dirección" htmlFor={ids.direccion} required error={errors.direccion} tall>
          <textarea id={ids.direccion} data-testid="taller-direccion" aria-required="true" rows={2} className="mac-row-input h-auto resize-none py-3" aria-invalid={Boolean(errors.direccion)} value={form.direccion} onChange={(event) => update('direccion', event.target.value)} />
        </FormRow>
        <FormRow label="Correo" htmlFor={ids.correo} optional filled={form.correo !== ''} error={errors.correo}>
          <input id={ids.correo} data-testid="taller-correo" type="email" className="mac-row-input" aria-invalid={Boolean(errors.correo)} aria-describedby={describedByFor(ids.correo, errors.correo, true)} value={form.correo} onChange={(event) => update('correo', event.target.value)} />
        </FormRow>
        <p className="respaldo-hint">La dirección admite hasta 2 líneas. El teléfono debe tener 10 dígitos.</p>
        <div className="flex justify-end gap-3 px-4 py-3">
          <button type="button" data-testid="taller-reset" className="mac-btn mac-btn-secondary" onClick={() => void handleReset()}>Restablecer valores originales</button>
          <button type="button" data-testid="taller-save" className="mac-btn mac-btn-primary" onClick={handleSave}>Guardar</button>
        </div>
      </Card>
      <Card as="section">
        <CardHeader icon={<MessageSquareText size={18} />} title="Mensaje para clientes" subtitle="Texto que acompaña la cotización al enviarla por WhatsApp o correo." />
        <div className="px-4 pb-2">
          <label htmlFor={messageId} className="sr-only">Mensaje para clientes</label>
          <textarea ref={messageRef} id={messageId} data-testid="taller-mensaje" rows={6} className="w-full resize-y rounded-lg border border-mac-separator bg-white px-3 py-2 text-sm leading-5 text-mac-ink" aria-invalid={messageTooLong} value={message} onChange={(event) => setMessage(event.target.value)} />
          <div className="mt-1 flex justify-between text-[12px] text-mac-ink-2">
            <span role={messageTooLong ? 'alert' : undefined} className={messageTooLong ? 'text-red-600' : undefined}>{messageTooLong ? `Máximo ${MESSAGE_MAX} caracteres.` : 'Las variables se reemplazan al enviar.'}</span>
            <span>{message.length}/{MESSAGE_MAX}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Variables disponibles">
            {MESSAGE_VARIABLES.map((variable) => (
              <button key={variable.key} type="button" title={variable.description} data-testid={`taller-variable-${variable.key}`} className="rounded-md bg-mac-tint px-2 py-1 text-[12px] font-medium text-mac-accent-text" onClick={() => insertVariable(variable.key)}>{`{${variable.key}}`}</button>
            ))}
          </div>
        </div>
        <p className="respaldo-hint">Vista previa con datos de ejemplo</p>
        <pre data-testid="taller-mensaje-preview" className="mx-4 mb-3 mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 font-sans text-sm leading-5 text-mac-ink">{previewMessage(message)}</pre>
        <div className="flex justify-end gap-3 px-4 py-3">
          <button type="button" data-testid="taller-mensaje-reset" className="mac-btn mac-btn-secondary" disabled={message === DEFAULT_MESSAGE_TEMPLATE} onClick={() => setMessage(DEFAULT_MESSAGE_TEMPLATE)}>Restablecer mensaje original</button>
          <button type="button" data-testid="taller-mensaje-save" className="mac-btn mac-btn-primary" disabled={!messageDirty || messageTooLong} onClick={handleSaveMessage}>Guardar mensaje</button>
        </div>
      </Card>
    </div>
  </div>;
}
