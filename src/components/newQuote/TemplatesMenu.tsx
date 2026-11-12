import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react';
import type { QuoteDraftItem } from '../../models/quoteDraft';
import { MAX_TEMPLATES, TEMPLATE_FAILURE_MESSAGES, TEMPLATE_NAME_MAX_LENGTH, quoteTemplateService, templateItemsFromForm } from '../../services/quoteTemplateService';
import type { QuoteTemplate } from '../../services/quoteTemplateService';
import { useConfirm } from '../../hooks/useConfirm';
import { FieldError } from '../ui/FieldError';
import { FloatingPanel } from '../ui/FloatingPanel';
import { useToast } from '../ui/Toast';

interface Props {
  /** Concepts currently in the form (what "save as template" captures). */
  items: readonly QuoteDraftItem[];
  /** Appends the template's concepts to the form. */
  onApply: (template: QuoteTemplate) => void;
}

type View = { mode: 'list' } | { mode: 'save' } | { mode: 'rename'; id: string };

const plural = (count: number) => `${count} ${count === 1 ? 'concepto' : 'conceptos'}`;

/** "Plantillas" button + macOS-style popover: apply, save the current concepts, rename, delete. */
export function TemplatesMenu({ items, onApply }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ mode: 'list' });
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const nameInputId = useId();
  const nameErrorId = `${nameInputId}-error`;

  function show(next: View, initialName = '') {
    setView(next);
    setName(initialName);
    setError('');
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function toggle() {
    if (open) { close(false); return; }
    setTemplates(quoteTemplateService.list());
    show({ mode: 'list' });
    setOpen(true);
  }

  // Focus moves into the popover after it mounts: the name field when there is one, otherwise the first item.
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      (panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>('[data-tpl-item]') ?? panel)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (view.mode === 'list') close(true);
      else show({ mode: 'list' });
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const focusables = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[data-tpl-item]') ?? []);
    if (focusables.length === 0 || (event.target as HTMLElement).tagName === 'INPUT') return;
    event.preventDefault();
    const current = focusables.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    focusables[current === -1 ? (step > 0 ? 0 : focusables.length - 1) : (current + step + focusables.length) % focusables.length].focus();
  }

  function startSave() {
    if (templateItemsFromForm(items).length === 0) {
      setError(TEMPLATE_FAILURE_MESSAGES['no-items']);
      return;
    }
    show({ mode: 'save' });
  }

  function submitName() {
    if (view.mode === 'save') {
      const result = quoteTemplateService.create(name, templateItemsFromForm(items));
      if (!result.ok) { setError(TEMPLATE_FAILURE_MESSAGES[result.reason]); return; }
      toast.success({ title: 'Plantilla guardada', description: `Se guardó “${result.value.name}” con ${plural(result.value.items.length)}.` });
      close(true);
    } else if (view.mode === 'rename') {
      const result = quoteTemplateService.rename(view.id, name);
      if (!result.ok) { setError(TEMPLATE_FAILURE_MESSAGES[result.reason]); return; }
      toast.success({ title: 'Plantilla renombrada', description: `Ahora se llama “${result.value.name}”.` });
      setTemplates(quoteTemplateService.list());
      show({ mode: 'list' });
    }
  }

  async function remove(template: QuoteTemplate) {
    close(true);
    const accepted = await confirm({ title: '¿Eliminar esta plantilla?', description: `La plantilla “${template.name}” se eliminará. Las cotizaciones que ya hiciste no cambian.`, confirmLabel: 'Eliminar plantilla', tone: 'danger' });
    if (!accepted) return;
    const result = quoteTemplateService.remove(template.id);
    if (result.ok) toast.warning({ title: 'Plantilla eliminada', description: `Se eliminó “${template.name}”.` });
    else toast.error({ title: 'No se pudo eliminar', description: TEMPLATE_FAILURE_MESSAGES[result.reason] });
  }

  const atLimit = templates.length >= MAX_TEMPLATES;
  const title = view.mode === 'save' ? 'Guardar como plantilla' : view.mode === 'rename' ? 'Renombrar plantilla' : 'Plantillas';

  return <>
    <button ref={triggerRef} type="button" data-testid="plantillas-boton" aria-haspopup="dialog" aria-expanded={open} className="mac-press flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-mac-accent-text hover:bg-mac-fill" onClick={toggle}>
      <LayoutTemplate size={15} aria-hidden="true" />Plantillas
    </button>
    <FloatingPanel open={open} anchor={triggerRef.current} minWidth={320} maxHeight={420} panelRef={panelRef} keepFocus={false} className="jc-tpl-pop">
      <div role="dialog" aria-label={title} data-testid="plantillas-popover" tabIndex={-1} onKeyDown={onKeyDown}>
        <p className="jc-tpl-title">{title}</p>
        {view.mode === 'list' ? <>
          {templates.length === 0
            ? <p className="jc-tpl-empty" data-testid="plantillas-vacio">Aún no tienes plantillas. Guarda los conceptos de esta cotización para reutilizarlos.</p>
            : <ul className="jc-tpl-list" aria-label="Plantillas guardadas">
              {templates.map((template) => <li key={template.id} className="jc-tpl-row" data-testid="plantilla-fila">
                <button type="button" data-tpl-item className="jc-tpl-apply" aria-label={`Usar plantilla ${template.name}, ${plural(template.items.length)}`} onClick={() => { close(true); onApply(template); }}>
                  <span className="truncate">{template.name}</span>
                  <span className="jc-tpl-detail">{plural(template.items.length)}</span>
                </button>
                <button type="button" data-tpl-item className="jc-tpl-icon" aria-label={`Renombrar plantilla ${template.name}`} onClick={() => show({ mode: 'rename', id: template.id }, template.name)}><Pencil size={14} aria-hidden="true" /></button>
                <button type="button" data-tpl-item className="jc-tpl-icon jc-tpl-icon--danger" aria-label={`Eliminar plantilla ${template.name}`} onClick={() => void remove(template)}><Trash2 size={14} aria-hidden="true" /></button>
              </li>)}
            </ul>}
          <div className="jc-tpl-sep" role="separator" />
          <button type="button" data-tpl-item data-testid="plantillas-guardar" className="jc-tpl-action" disabled={atLimit} onClick={startSave}>
            <Plus size={14} aria-hidden="true" />Guardar conceptos actuales como plantilla…
          </button>
          {atLimit && <p className="jc-tpl-note">{TEMPLATE_FAILURE_MESSAGES.limit}</p>}
          {error && <p role="alert" className="jc-tpl-note jc-tpl-note--error" data-testid="plantillas-error">{error}</p>}
        </> : <form className="jc-tpl-form" onSubmit={(event) => {
          // React bubbles portal events to the quote <form>: without this, saving a template would submit the quote.
          event.preventDefault();
          event.stopPropagation();
          submitName();
        }} noValidate>
          <label htmlFor={nameInputId} className="jc-tpl-label">Nombre</label>
          <input id={nameInputId} data-autofocus data-testid="plantillas-nombre" className="jc-tpl-input" value={name} maxLength={TEMPLATE_NAME_MAX_LENGTH + 20} autoComplete="off" placeholder="Ej. Afinación mayor" aria-invalid={Boolean(error)} aria-describedby={error ? nameErrorId : undefined} onChange={(event) => { setName(event.target.value); if (error) setError(''); }} />
          <FieldError id={nameErrorId} message={error} className="pt-1" />
          {view.mode === 'save' && <p className="jc-tpl-note">Se guardan {plural(templateItemsFromForm(items).length)} con su descripción, cantidad y precio sugerido.</p>}
          <div className="jc-tpl-buttons">
            <button type="button" className="mac-btn mac-btn-secondary" onClick={() => show({ mode: 'list' })}>Cancelar</button>
            <button type="submit" data-testid="plantillas-confirmar" className="mac-btn mac-btn-primary">{view.mode === 'save' ? 'Guardar' : 'Renombrar'}</button>
          </div>
        </form>}
      </div>
    </FloatingPanel>
  </>;
}
