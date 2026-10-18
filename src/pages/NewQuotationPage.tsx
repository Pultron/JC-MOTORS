import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { FolderOpen, RotateCcw, Trash2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { ClientVehicleSection, PublicNotesSection, QuoteItemsSection } from '../components/newQuote/QuoteFormSections';
import { QuoteSummary } from '../components/newQuote/QuoteSummary';
import { useToast } from '../components/Toast';
import type { QuoteDraft, QuoteDraftItem, QuoteFormData } from '../models/quoteDraft';
import type { CreateQuotationInput, Quotation } from '../models/quotation';
import { frequentConcepts } from '../repositories/serviceFixtures';
import { quoteDraftService } from '../services/quoteDraftService';
import type { TemporaryQuoteDraft } from '../services/quoteDraftService';
import { validateQuoteForm } from '../services/quoteValidation';
import { useCustomers } from '../store/CustomerContext';
import { useQuotations } from '../store/QuotationContext';
import { calculateQuotationTotals, createId } from '../utils/quotation';

function blankItem(description = ''): QuoteDraftItem {
  return { id: createId(), type: 'part', description, quantity: '1', unitPrice: '' };
}

function displayLaborAmount(value?: string): string {
  return value && Number(value) !== 0 ? value : '';
}

function emptyForm(): QuoteFormData {
  return {
    customerId: '', customerName: '', phone: '', email: '', make: '', model: '', year: '', plates: '',
    items: [blankItem('')], laborAmount: '', laborDiscountType: 'percentage', laborDiscountValue: '0', ivaEnabled: true,
    validityDays: '', publicNotes: '', customerNotes: '',
  };
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es-MX');
}

function formFromQuotation(quotation: Quotation): QuoteFormData {
  const parts = quotation.items.filter((item) => item.type === 'part').map((item) => ({
    id: item.id,
    type: item.type,
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: String(item.saleUnitPrice),
  }));
  const laborAmount = quotation.items.filter((item) => item.type === 'labor').reduce((sum, item) => sum + item.amount, 0);
  return {
    customerId: quotation.customerId ?? '', customerName: quotation.customer.name, phone: quotation.customer.phone,
    email: quotation.customer.email ?? '', make: quotation.vehicle.make, model: quotation.vehicle.model,
    year: quotation.vehicle.year ? String(quotation.vehicle.year) : '', plates: quotation.vehicle.plates,
    items: parts.length ? parts : [blankItem('')], laborAmount: displayLaborAmount(String(laborAmount)),
    laborDiscountType: quotation.laborDiscountType, laborDiscountValue: String(quotation.laborDiscountValue),
    ivaEnabled: quotation.includeVat, validityDays: String(quotation.validityDays),
    publicNotes: quotation.publicNotes, customerNotes: quotation.customerNotes ?? '',
  };
}

export function NewQuotationPage() {
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('editar') ?? undefined;
  const navigate = useNavigate();
  const { customers, createCustomer } = useCustomers();
  const { quotations, isLoading, createQuotation, updateQuotation } = useQuotations();
  const showToast = useToast();
  const [form, setForm] = useState<QuoteFormData>(emptyForm);
  const [editReady, setEditReady] = useState(!editId);
  const [drafts, setDrafts] = useState<QuoteDraft[]>(() => quoteDraftService.list());
  const [activeDraft, setActiveDraft] = useState<QuoteDraft | null>(null);
  const [recovery, setRecovery] = useState<TemporaryQuoteDraft | null>(() => quoteDraftService.getTemporary());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [dirty, setDirty] = useState(false);
  const autosaveTimer = useRef<number | null>(null);
  const loadedEditId = useRef<string | null>(null);
  const quotationToEdit = quotations.find((quotation) => quotation.id === editId);

  useEffect(() => {
    if (!editId || isLoading) return;
    if (loadedEditId.current === editId) return;
    if (!quotationToEdit || quotationToEdit.status !== 'Pendiente') {
      navigate(quotationToEdit ? `/cotizaciones/${editId}` : '/historial', { replace: true });
      return;
    }
    loadedEditId.current = editId;
    setForm(formFromQuotation(quotationToEdit));
    setRecovery(null);
    setActiveDraft(null);
    setDirty(false);
    setSaveState('saved');
    setEditReady(true);
  }, [editId, isLoading, quotationToEdit, navigate]);

  const totals = useMemo(() => {
    const labor = Math.max(0, Number(form.laborAmount) || 0);
    return calculateQuotationTotals(
      [
        ...form.items.map((item) => ({ type: item.type, quantity: Math.max(0, Number(item.quantity) || 0), saleUnitPrice: Math.max(0, Number(item.unitPrice) || 0) })),
        ...(labor > 0 ? [{ type: 'labor' as const, quantity: 1, saleUnitPrice: labor }] : []),
      ],
      form.laborDiscountType, Number(form.laborDiscountValue) || 0, form.ivaEnabled,
    );
  }, [form.items, form.laborAmount, form.laborDiscountType, form.laborDiscountValue, form.ivaEnabled]);

  const suggestions = useMemo(() => Array.from(new Set([
    ...frequentConcepts.map((concept) => concept.description),
    ...quotations.flatMap((quote) => quote.items.map((item) => item.description)),
  ])).sort((a, b) => a.localeCompare(b, 'es-MX')), [quotations]);

  useEffect(() => {
    if (!dirty || recovery || editId) return;
    setSaveState('saving');
    autosaveTimer.current = window.setTimeout(() => {
      try {
        quoteDraftService.saveTemporary(form, activeDraft?.id ?? null);
        setSaveState('saved');
      } catch {
        setSaveState('idle');
        showToast({ type: 'error', title: 'Error al guardar', message: 'No se pudo guardar el borrador temporal. Revisa el espacio disponible.' });
      }
    }, 650);
    return () => { if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current); };
  }, [form, dirty, recovery, activeDraft, editId, showToast]);

  useEffect(() => {
    if (!form.laborDiscountValue.trim()) return;
    const value = Number(form.laborDiscountValue);
    if (!Number.isFinite(value)) return;
    const maximum = form.laborDiscountType === 'percentage' ? 100 : totals.subtotalManoObra;
    const bounded = Math.max(0, Math.min(value, maximum));
    if (bounded !== value) setForm((current) => ({ ...current, laborDiscountValue: String(bounded) }));
  }, [form.laborDiscountType, form.laborDiscountValue, totals.subtotalManoObra]);

  function updateField<K extends keyof QuoteFormData>(key: K, value: QuoteFormData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
    setDirty(true);
  }

  function updateCustomer(value: string) {
    const match = customers.find((customer) => normalize(customer.name) === normalize(value)
      || customer.aliases.some((alias) => normalize(alias) === normalize(value)));
    setForm((current) => match ? {
      ...current, customerId: match.id, customerName: match.name, phone: match.phone, email: match.email ?? '',
    } : { ...current, customerId: '', customerName: value, ...(current.customerId ? { phone: '', email: '' } : {}) });
    setErrors((current) => ({ ...current, customerName: '' }));
    setDirty(true);
  }

  function selectCustomer(id: string) {
    const customer = customers.find((item) => item.id === id);
    if (!customer) return;
    setForm((current) => ({ ...current, customerId: id, customerName: customer.name, phone: customer.phone, email: customer.email ?? '' }));
    setErrors((current) => ({ ...current, customerName: '' }));
    setDirty(true);
  }

  function addItem(description = '') {
    const only = form.items.length === 1 ? form.items[0] : undefined;
    if (description && only && !only.description.trim() && !only.unitPrice.trim()) {
      updateField('items', [{ ...only, description }]);
    } else {
      updateField('items', [...form.items, blankItem(description)]);
    }
    setErrors((current) => ({ ...current, items: '' }));
  }

  function updateItem(id: string, key: keyof Omit<QuoteDraftItem, 'id' | 'type'>, value: string) {
    setForm((current) => {
      const items = current.items.map((item) => item.id === id ? { ...item, [key]: value } as QuoteDraftItem : item);
      return { ...current, items };
    });
    setErrors((current) => ({ ...current, [`item-${id}-${key}`]: '' }));
    setDirty(true);
  }

  function deleteItem(id: string) {
    const items = form.items.filter((item) => item.id !== id);
    updateField('items', items.length ? items : [blankItem('')]);
  }

  function validate(): boolean {
    const next = validateQuoteForm(form, totals);
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    const labor = Math.max(0, Number(form.laborAmount) || 0);
    const input: CreateQuotationInput = {
      ...(activeDraft ? { preferredFolio: activeDraft.folio } : {}),
      ...(form.customerId ? { customerId: form.customerId } : {}),
      customer: { name: form.customerName.trim(), phone: form.phone.trim(), ...(form.email.trim() ? { email: form.email.trim() } : {}) },
      vehicle: { make: form.make.trim(), model: form.model.trim(), ...(form.year ? { year: Number(form.year) } : {}), plates: form.plates.trim().toUpperCase() },
      items: [
        ...form.items.filter((item) => item.description.trim() || String(item.unitPrice).trim()).map((item) => ({ id: item.id, type: item.type, description: item.description.trim(), quantity: Number(item.quantity), saleUnitPrice: Number(item.unitPrice) })),
        ...(labor > 0 ? [{ id: createId(), type: 'labor' as const, description: 'Mano de obra', quantity: 1, saleUnitPrice: labor }] : []),
      ],
      laborDiscountType: form.laborDiscountType, laborDiscountValue: Number(form.laborDiscountValue), includeVat: form.ivaEnabled,
      validityDays: Number(form.validityDays), publicNotes: form.publicNotes.trim(), customerNotes: form.customerNotes.trim(),
    };
    setBusy(true);
    try {
      const quote = editId
        ? await updateQuotation(editId, input)
        : await createQuotation(input);
      if (!quote) {
        showToast({ type: 'warning', title: 'Cotización no editable', message: 'Esta cotización ya no está pendiente y no se puede editar.' });
        return;
      }
      if (!form.customerId && !customers.some((customer) => normalize(customer.name) === normalize(form.customerName))) {
        createCustomer({ name: form.customerName.trim(), phone: form.phone.trim(), ...(form.email.trim() ? { email: form.email.trim() } : {}), aliases: [] });
      }
      if (!editId) {
        if (activeDraft) quoteDraftService.delete(activeDraft.id);
        quoteDraftService.deleteTemporary();
        setDirty(false);
      }
      navigate('/historial');
    } catch {
      showToast({ type: 'error', title: 'Error al guardar', message: 'No se pudo guardar la cotización. Inténtalo de nuevo.' });
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    try {
      const saved = await quoteDraftService.save(form, activeDraft ?? undefined);
      setActiveDraft(saved);
      setDrafts(quoteDraftService.list());
      if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
      quoteDraftService.deleteTemporary();
      setDirty(false);
      setSaveState('saved');
      showToast({ type: 'success', title: 'Borrador guardado', message: `El borrador ${saved.folio} se guardó correctamente.` });
    } catch {
      showToast({ type: 'error', title: 'Error al guardar', message: 'No se pudo guardar el borrador.' });
    } finally {
      setBusy(false);
    }
  }

  function clearForm() {
    if (!window.confirm('¿Limpiar todos los datos capturados?')) return;
    if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
    quoteDraftService.deleteTemporary();
    setForm(emptyForm()); setActiveDraft(null); setRecovery(null); setErrors({}); setDirty(false); setSaveState('idle');
    showToast({ type: 'info', title: 'Formulario limpio.' });
  }

  function openDraft(draft: QuoteDraft) {
    if (dirty && !window.confirm('¿Abrir este borrador y reemplazar el formulario actual?')) return;
    quoteDraftService.deleteTemporary();
    setRecovery(null);
    setForm({ ...draft.data, laborAmount: displayLaborAmount(draft.data.laborAmount), customerNotes: draft.data.customerNotes ?? '' });
    setActiveDraft(draft); setErrors({}); setDirty(false); setSaveState('saved');
    showToast({ type: 'info', title: 'Borrador abierto', message: `Borrador ${draft.folio} abierto.` });
  }

  function deleteDraft(draft: QuoteDraft) {
    if (!window.confirm(`¿Eliminar el borrador ${draft.folio}?`)) return;
    quoteDraftService.delete(draft.id);
    setDrafts(quoteDraftService.list());
    if (activeDraft?.id === draft.id) setActiveDraft(null);
    showToast({ type: 'warning', title: 'Borrador eliminado', message: `Borrador ${draft.folio} eliminado.` });
  }

  if (editId && (!editReady || loadedEditId.current !== editId || isLoading)) return <p className="py-16 text-center text-sm text-slate-500">Cargando cotización…</p>;

  return <div className="new-quotation-page">
    {!editId && <span role="status" className="sr-only">{saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? 'Guardado automáticamente' : 'Guardado automático'}</span>}
    {!editId && recovery && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><span>Hay un formulario guardado automáticamente. ¿Deseas recuperarlo?</span><div className="flex gap-2"><button type="button" className="rounded-lg bg-blue-700 px-3 py-2 font-semibold text-white hover:bg-blue-800" onClick={() => { setForm({ ...recovery.data, laborAmount: displayLaborAmount(recovery.data.laborAmount), customerNotes: recovery.data.customerNotes ?? '' }); setActiveDraft(drafts.find((draft) => draft.id === recovery.draftId) ?? null); setRecovery(null); setDirty(false); setSaveState('saved'); }}>Recuperar</button><button type="button" className="rounded-lg border border-blue-200 px-3 py-2 font-semibold hover:bg-white" onClick={() => { quoteDraftService.deleteTemporary(); setRecovery(null); }}>Descartar</button></div></div>}
    {!editId && drafts.length > 0 && <section className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3"><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-navy-950"><FolderOpen size={17} />Borradores guardados</h2><div className="flex flex-wrap gap-2">{drafts.map((draft) => <div key={draft.id} className="flex items-center gap-1 rounded-lg border border-slate-200 pl-3 text-xs"><button type="button" className="py-2 font-semibold text-blue-700 hover:underline" onClick={() => openDraft(draft)}>{draft.folio} · {draft.data.customerName || 'Sin cliente'}</button><button type="button" className="rounded-lg p-2 text-slate-400 hover:text-rose-600" aria-label={`Eliminar borrador ${draft.folio}`} onClick={() => deleteDraft(draft)}><Trash2 size={14} /></button></div>)}</div></section>}
    <form onSubmit={handleSubmit} noValidate className="quote-form-grid">
      <div className="quote-form-sections">
        {editId && quotationToEdit && <p className="flex items-center gap-2 text-xs font-medium text-blue-700"><RotateCcw size={14} />Editando cotización {quotationToEdit.folio}</p>}
        {!editId && activeDraft && <p className="flex items-center gap-2 text-xs font-medium text-blue-700"><RotateCcw size={14} />Editando borrador {activeDraft.folio}</p>}
        <ClientVehicleSection form={form} errors={errors} customers={customers} onChange={updateField} onCustomerChange={updateCustomer} onSelectCustomer={selectCustomer} />
        <QuoteItemsSection form={form} errors={errors} suggestions={suggestions} onAdd={addItem} onUpdate={updateItem} onDelete={deleteItem} />
        <PublicNotesSection form={form} errors={errors} onChange={updateField} />
      </div>
      <QuoteSummary form={form} totals={totals} errors={errors} busy={busy} onChange={updateField} onSaveDraft={editId ? undefined : saveDraft} onClear={editId ? undefined : clearForm} submitLabel={editId ? 'Guardar cambios' : 'Guardar cotización'} />
    </form>
  </div>;
}
