import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { LayoutTemplate, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { QuoteDraftItem } from '../../models/quoteDraft';
import { TEMPLATE_FAILURE_MESSAGES, TEMPLATE_NAME_MAX_LENGTH, quoteTemplateService, deriveTemplateName, templateItemsFromForm } from '../../services/quoteTemplateService';
import type { QuoteTemplate, QuoteTemplateItem } from '../../services/quoteTemplateService';
import { MAX_CONCEPTS } from '../../services/quotationLayout';
import { createId } from '../../utils/quotation';
import { sanitizeMoneyInput, sanitizeSingleLine } from '../../validation/fields';
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

/** `edit.id` is null when creating a template from scratch. */
type View = { mode: 'list' } | { mode: 'save' } | { mode: 'edit'; id: string | null };

/** A concept row in the editor. `key` is only for React; it is not saved. */
interface EditorRow extends QuoteTemplateItem { key: string }

/** Lists with more templates than this get a search field. */
const SEARCH_THRESHOLD = 8;

const blankRow = (): EditorRow => ({ key: createId(), type: 'part', description: '', quantity: '1', unitPrice: '' });
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-MX');
const plural = (count: number) => `${count} ${count === 1 ? 'concepto' : 'conceptos'}`;

/** "Plantillas" button + macOS-style popover: apply, save the current concepts, create or edit (name, concepts, prices), delete. */
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
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [query, setQuery] = useState('');
  const [focusRow, setFocusRow] = useState<string | null>(null);
  const nameInputId = useId();
  const nameErrorId = `${nameInputId}-error`;

  function show(next: View, initialName = '', initialRows: EditorRow[] = []) {
    setView(next);
    setName(initialName);
    setRows(initialRows);
    setError('');
  }

  function startEdit(template: QuoteTemplate | null) {
    show({ mode: 'edit', id: template?.id ?? null }, template?.name ?? '', template ? template.items.map((item) => ({ ...item, key: createId() })) : [blankRow()]);
  }

  function updateRow(key: string, patch: Partial<QuoteTemplateItem>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    if (error) setError('');
  }

  function addRow() {
    if (rows.length >= MAX_CONCEPTS) { setError(`Una plantilla admite máximo ${MAX_CONCEPTS} conceptos.`); return; }
    const row = blankRow();
    setRows((current) => [...current, row]);
    setFocusRow(row.key);
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function toggle() {
    if (open) { close(false); return; }
    setTemplates(quoteTemplateService.list());
    show({ mode: 'list' });
    setQuery('');
    setOpen(true);
  }

  // Focus moves into the popover after it mounts: the name/search field when there is one, otherwise the first item.
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      (panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>('[data-tpl-item]') ?? panel)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, view]);

  // A newly added editor row takes focus on its description and scrolls into view.
  useEffect(() => {
    if (!focusRow) return;
    const field = panelRef.current?.querySelector<HTMLElement>(`[data-tpl-desc="${focusRow}"]`);
    field?.focus();
    field?.scrollIntoView({ block: 'nearest' });
    setFocusRow(null);
  }, [focusRow]);

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
    const target = event.target as HTMLElement;
    // Text fields and selects keep their own arrow behavior; only the search field hands focus to the list.
    if (focusables.length === 0 || (target.tagName === 'INPUT' && !target.hasAttribute('data-tpl-search')) || target.tagName === 'SELECT') return;
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

  function submit() {
    if (view.mode === 'save') {
      const result = quoteTemplateService.create(name, templateItemsFromForm(items));
      if (!result.ok) { setError(TEMPLATE_FAILURE_MESSAGES[result.reason]); return; }
      toast.success({ title: 'Plantilla guardada', description: `Se guardó “${result.value.name}” con ${plural(result.value.items.length)}.` });
      close(true);
    } else if (view.mode === 'edit') {
      const payload: QuoteTemplateItem[] = rows.map(({ description, type, quantity, unitPrice }) => ({ description, type, quantity, unitPrice }));
      // The editor has no name field: the template is named after its first concept.
      const autoName = deriveTemplateName(payload);
      if (!autoName) { setError(TEMPLATE_FAILURE_MESSAGES['no-items']); return; }
      const result = view.id ? quoteTemplateService.update(view.id, autoName, payload) : quoteTemplateService.create(autoName, payload);
      if (!result.ok) { setError(TEMPLATE_FAILURE_MESSAGES[result.reason]); return; }
      toast.success({ title: view.id ? 'Plantilla actualizada' : 'Plantilla guardada', description: `“${result.value.name}” tiene ${plural(result.value.items.length)}.` });
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

  const isEditor = view.mode === 'edit';
  const title = view.mode === 'save' ? 'Guardar como plantilla' : view.mode === 'edit' ? (view.id ? 'Editar plantilla' : 'Nueva plantilla') : 'Plantillas';
  const showSearch = templates.length > SEARCH_THRESHOLD;
  const needle = fold(query.trim());
  const visible = needle ? templates.filter((template) => fold(template.name).includes(needle)) : templates;

  return <>
    <button ref={triggerRef} type="button" data-testid="plantillas-boton" aria-haspopup="dialog" aria-expanded={open} className="mac-press flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-mac-accent-text hover:bg-mac-fill" onClick={toggle}>
      <LayoutTemplate size={15} aria-hidden="true" />Plantillas
    </button>
    <FloatingPanel open={open} anchor={triggerRef.current} minWidth={isEditor ? 440 : 320} maxHeight={isEditor ? 520 : 420} panelRef={panelRef} keepFocus={false} className={isEditor ? 'jc-tpl-pop jc-tpl-pop--wide' : 'jc-tpl-pop'}>
      <div role="dialog" aria-label={title} data-testid="plantillas-popover" tabIndex={-1} onKeyDown={onKeyDown}>
        <p className="jc-tpl-title">{title}</p>
        {view.mode === 'list' ? <>
          {templates.length === 0
            ? <p className="jc-tpl-empty" data-testid="plantillas-vacio">Aún no tienes plantillas. Crea una o guarda los conceptos de esta cotización para reutilizarlos.</p>
            : <>
              {showSearch && <div className="jc-tpl-search">
                <Search size={14} aria-hidden="true" />
                <input data-tpl-search data-autofocus data-testid="plantillas-buscar" type="search" aria-label="Buscar plantilla" placeholder="Buscar plantilla" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>}
              {visible.length === 0
                ? <p className="jc-tpl-empty" data-testid="plantillas-sin-resultados">Ninguna plantilla coincide con “{query.trim()}”.</p>
                : <ul className="jc-tpl-list" aria-label="Plantillas guardadas">
                  {visible.map((template) => <li key={template.id} className="jc-tpl-row" data-testid="plantilla-fila">
                    <button type="button" data-tpl-item className="jc-tpl-apply" aria-label={`Usar plantilla ${template.name}, ${plural(template.items.length)}`} onClick={() => { close(true); onApply(template); }}>
                      <span className="truncate">{template.name}</span>
                      <span className="jc-tpl-detail">{plural(template.items.length)}</span>
                    </button>
                    <button type="button" data-tpl-item data-testid="plantilla-editar" className="jc-tpl-icon" aria-label={`Editar plantilla ${template.name}`} onClick={() => startEdit(template)}><Pencil size={14} aria-hidden="true" /></button>
                    <button type="button" data-tpl-item className="jc-tpl-icon jc-tpl-icon--danger" aria-label={`Eliminar plantilla ${template.name}`} onClick={() => void remove(template)}><Trash2 size={14} aria-hidden="true" /></button>
                  </li>)}
                </ul>}
            </>}
          <div className="jc-tpl-sep" role="separator" />
          <button type="button" data-tpl-item data-testid="plantillas-nueva" className="jc-tpl-action" onClick={() => startEdit(null)}>
            <Plus size={14} aria-hidden="true" />Nueva plantilla…
          </button>
          <button type="button" data-tpl-item data-testid="plantillas-guardar" className="jc-tpl-action" onClick={startSave}>
            <Plus size={14} aria-hidden="true" />Guardar conceptos actuales como plantilla…
          </button>
          {error && <p role="alert" className="jc-tpl-note jc-tpl-note--error" data-testid="plantillas-error">{error}</p>}
        </> : <form className="jc-tpl-form" onSubmit={(event) => {
          // React bubbles portal events to the quote <form>: without this, saving a template would submit the quote.
          event.preventDefault();
          event.stopPropagation();
          submit();
        }} noValidate>
          {view.mode === 'save' && <>
            <label htmlFor={nameInputId} className="jc-tpl-label">Nombre</label>
            <input id={nameInputId} data-autofocus data-testid="plantillas-nombre" className="jc-tpl-input" value={name} maxLength={TEMPLATE_NAME_MAX_LENGTH + 20} autoComplete="off" aria-required="true" aria-invalid={Boolean(error)} aria-describedby={error ? nameErrorId : undefined} onChange={(event) => { setName(event.target.value); if (error) setError(''); }} />
            <FieldError id={nameErrorId} message={error} className="pt-1" />
          </>}
          {view.mode === 'edit' && <>
            <p className="jc-tpl-label jc-tpl-label--section">Conceptos</p>
            <div className="jc-tpl-rows" role="group" aria-label="Conceptos de la plantilla">
              {rows.map((row, index) => <div key={row.key} className="jc-tpl-concept" data-testid="plantilla-concepto">
                <input data-tpl-desc={row.key} data-autofocus={index === 0 ? true : undefined} data-testid={`plantilla-descripcion-${index}`} className="jc-tpl-input jc-tpl-desc" aria-label={`Descripción del concepto ${index + 1}`} placeholder="Descripción" autoComplete="off" value={row.description} onChange={(event) => updateRow(row.key, { description: sanitizeSingleLine(event.target.value) })} />
                <div className="mac-money jc-tpl-money"><span aria-hidden="true">$</span><input data-testid={`plantilla-precio-${index}`} className="tnum" autoComplete="off" inputMode="decimal" aria-label={`Precio del concepto ${index + 1} (opcional)`} placeholder="Precio" value={row.unitPrice} onChange={(event) => updateRow(row.key, { unitPrice: sanitizeMoneyInput(event.target.value) })} /></div>
                <button type="button" className="jc-tpl-icon jc-tpl-icon--danger" aria-label={`Quitar concepto ${index + 1}`} disabled={rows.length === 1} onClick={() => { setRows((current) => current.filter((item) => item.key !== row.key)); if (error) setError(''); }}><X size={14} aria-hidden="true" /></button>
              </div>)}
            </div>
            <button type="button" data-testid="plantillas-agregar-concepto" className="jc-tpl-action jc-tpl-action--inline" onClick={addRow}><Plus size={14} aria-hidden="true" />Agregar concepto</button>
            <FieldError id={nameErrorId} message={error} className="pt-1" />
            <p className="jc-tpl-note">El precio es opcional; al usar la plantilla lo puedes cambiar en la cotización.</p>
          </>}
          {view.mode === 'save' && <p className="jc-tpl-note">Se guardan {plural(templateItemsFromForm(items).length)} con su descripción, cantidad y precio sugerido.</p>}
          <div className="jc-tpl-buttons">
            <button type="button" className="mac-btn mac-btn-secondary" onClick={() => show({ mode: 'list' })}>Cancelar</button>
            <button type="submit" data-testid="plantillas-confirmar" className="mac-btn mac-btn-primary">Guardar</button>
          </div>
        </form>}
      </div>
    </FloatingPanel>
  </>;
}
