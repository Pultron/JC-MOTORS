import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MessageSquareText } from 'lucide-react';
import { Card } from '../newQuote/primitives/Card';
import { CardHeader } from '../newQuote/primitives/CardHeader';
import { MESSAGE_MAX } from '../../config/businessInfo';
import type { MessageVariableInfo } from '../../services/shareMessage';
import { insertAtCursor } from '../../services/workshopForm';

/** The counter only appears when the message nears the limit. */
const MESSAGE_COUNTER_FROM = 700;

interface MessageCardProps {
  title: string;
  subtitle: string;
  value: string;
  onChange: (value: string) => void;
  variables: readonly MessageVariableInfo[];
  defaultTemplate: string;
  /** Rendered sample text for the preview. */
  preview: string;
  /** Email subject shown in the "Correo" preview. */
  previewSubject: string;
  onReset: () => void;
  /** Prefix of the data-testid values. 'taller' yields taller-mensaje, taller-variable-*, taller-preview-*; another prefix is used verbatim (e.g. 'taller-facturas'). */
  testBase: string;
  /** Extra content under the editor (not used today). */
  children?: ReactNode;
}

/** One editable message template (textarea, variable chips, WhatsApp / email preview and "Restablecer mensaje original"). */
export function MessageCard({ title, subtitle, value, onChange, variables, defaultTemplate, preview, previewSubject, onReset, testBase, children }: MessageCardProps) {
  const areaId = useId();
  const counterId = `${areaId}-counter`;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [previewMode, setPreviewMode] = useState<'whatsapp' | 'correo'>('whatsapp');
  const tooLong = value.length > MESSAGE_MAX;

  // The caret is restored after React re-renders the controlled textarea (which would otherwise move it to the end).
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    const area = areaRef.current;
    pendingCaret.current = null;
    if (caret === null || !area) return;
    area.focus();
    area.setSelectionRange(caret, caret);
  }, [value]);

  function insertVariable(key: string) {
    const area = areaRef.current;
    const result = insertAtCursor(value, area?.selectionStart ?? value.length, area?.selectionEnd ?? value.length, `{${key}}`);
    pendingCaret.current = result.caret;
    onChange(result.text);
  }

  return (
    <Card as="section">
      <CardHeader icon={<MessageSquareText size={18} />} title={title} subtitle={subtitle} />
      <div className="px-4 pb-2">
        <label htmlFor={areaId} className="sr-only">{title}</label>
        <textarea ref={areaRef} id={areaId} data-testid={`${testBase}-mensaje`} rows={6} className="w-full resize-y rounded-lg border border-mac-separator bg-white px-3 py-2 text-sm leading-5 text-mac-ink" aria-invalid={tooLong} aria-describedby={counterId} value={value} onChange={(event) => onChange(event.target.value)} />
        {value.length > MESSAGE_COUNTER_FROM && <p id={counterId} data-testid={`${testBase}-mensaje-contador`} role={tooLong ? 'alert' : undefined} className={`mt-1 text-right text-[12px] ${tooLong ? 'font-medium text-mac-danger' : 'text-mac-ink-2'}`}>{value.length} / {MESSAGE_MAX}{tooLong ? ' · Reduce el mensaje para guardarlo.' : ''}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Variables disponibles">
          {variables.map((variable) => (
            <button key={variable.key} type="button" title={variable.description} data-testid={`${testBase}-variable-${variable.key}`} className="rounded-md bg-mac-tint px-2 py-1 text-[12px] font-medium text-mac-accent-text" onMouseDown={(event) => event.preventDefault()} onClick={() => insertVariable(variable.key)}>{`{${variable.key}}`}</button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-mac-ink-2">Toca para insertar</p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-mac-separator px-4 pt-3">
        <p className="text-[13px] text-mac-ink-2">Vista previa con datos de ejemplo</p>
        <div className="mac-segment flex" role="group" aria-label="Formato de la vista previa">
          <button type="button" data-testid={`${testBase}-preview-whatsapp`} aria-pressed={previewMode === 'whatsapp'} onClick={() => setPreviewMode('whatsapp')}>WhatsApp</button>
          <button type="button" data-testid={`${testBase}-preview-correo`} aria-pressed={previewMode === 'correo'} onClick={() => setPreviewMode('correo')}>Correo</button>
        </div>
      </div>
      <div data-testid={`${testBase}-mensaje-preview`} data-mode={previewMode} className="px-4 pb-3 pt-3" aria-live="polite">
        {previewMode === 'whatsapp'
          ? <div className="taller-bubble">{preview}</div>
          : <div className="taller-mail">
            <p className="taller-mail-subject"><span>Asunto</span>{previewSubject}</p>
            <div className="taller-mail-body">{preview}</div>
          </div>}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 pb-3">
        <button type="button" data-testid={`${testBase}-mensaje-reset`} className="taller-link" disabled={value === defaultTemplate} onClick={onReset}>Restablecer mensaje original</button>
      </div>
      {children}
    </Card>
  );
}
