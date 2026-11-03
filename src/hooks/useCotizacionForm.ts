import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from './useConfirm';
import type { QuoteDraft, QuoteDraftItem, QuoteFormData } from '../models/quoteDraft';
import type { CreateQuotationInput, Quotation } from '../models/quotation';
import { frequentConcepts } from '../repositories/serviceFixtures';
import { quoteDraftService } from '../services/quoteDraftService';
import type { TemporaryQuoteDraft } from '../services/quoteDraftService';
import { validateQuoteForm } from '../services/quoteValidation';
import { useCustomers } from '../store/CustomerContext';
import { useQuotations } from '../store/QuotationContext';
import { parseDecimal } from '../utils/currency';
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
    validityDays: '15', publicNotes: '', customerNotes: '',
  };
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('es-MX');
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

/** Estado, cálculos derivados y acciones de la pantalla "Nueva cotización". */
export function useCotizacionForm() {
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('editar') ?? undefined;
  const navigate = useNavigate();
  const { customers, createCustomer } = useCustomers();
  const { quotations, isLoading, createQuotation, updateQuotation } = useQuotations();
  const toast = useToast();
  const confirm = useConfirm();
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
    const labor = parseDecimal(form.laborAmount);
    return calculateQuotationTotals(
      [
        ...form.items.map((item) => ({ type: item.type, quantity: parseDecimal(item.quantity), saleUnitPrice: parseDecimal(item.unitPrice) })),
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
        toast.error({ title: 'Error al guardar', description: 'No se pudo guardar el borrador temporal. Revisa el espacio disponible.' });
      }
    }, 650);
    return () => { if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current); };
  }, [form, dirty, recovery, activeDraft, editId, toast]);

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

  function setLaborAmount(value: string) {
    setForm((current) => ({ ...current, laborAmount: value, ...(parseDecimal(value) > 0 || current.laborDiscountType === 'percentage' ? {} : { laborDiscountValue: '0' }) }));
    setErrors((current) => ({ ...current, laborAmount: '' }));
    setDirty(true);
  }

  function validate(): boolean {
    const next = validateQuoteForm(form, totals);
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    const labor = parseDecimal(form.laborAmount);
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
        toast.warning({ title: 'Cotización no editable', description: 'Esta cotización ya no está pendiente y no se puede editar.' });
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
      toast.error({ title: 'Error al guardar', description: 'No se pudo guardar la cotización. Inténtalo de nuevo.' });
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
      toast.success({ title: 'Borrador guardado', description: `El borrador ${saved.folio} se guardó correctamente.` });
    } catch {
      toast.error({ title: 'Error al guardar', description: 'No se pudo guardar el borrador.' });
    } finally {
      setBusy(false);
    }
  }

  async function clearForm() {
    const accepted = await confirm({ title: '¿Limpiar el formulario?', description: 'Se borrarán todos los datos capturados en esta cotización.', confirmLabel: 'Limpiar formulario', tone: 'danger' });
    if (!accepted) return;
    if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
    quoteDraftService.deleteTemporary();
    setForm(emptyForm()); setActiveDraft(null); setRecovery(null); setErrors({}); setDirty(false); setSaveState('idle');
    toast.info({ title: 'Formulario limpio.' });
  }

  async function openDraft(draft: QuoteDraft) {
    if (dirty && !(await confirm({ title: '¿Abrir este borrador?', description: 'Se reemplazarán los datos del formulario actual.', confirmLabel: 'Abrir borrador' }))) return;
    quoteDraftService.deleteTemporary();
    setRecovery(null);
    setForm({ ...draft.data, laborAmount: displayLaborAmount(draft.data.laborAmount), customerNotes: draft.data.customerNotes ?? '' });
    setActiveDraft(draft); setErrors({}); setDirty(false); setSaveState('saved');
    toast.info({ title: 'Borrador abierto', description: `Borrador ${draft.folio} abierto.` });
  }

  async function deleteDraft(draft: QuoteDraft) {
    const accepted = await confirm({ title: '¿Eliminar este borrador?', description: `El borrador ${draft.folio} se eliminará definitivamente.`, confirmLabel: 'Eliminar borrador', tone: 'danger' });
    if (!accepted) return;
    quoteDraftService.delete(draft.id);
    setDrafts(quoteDraftService.list());
    if (activeDraft?.id === draft.id) setActiveDraft(null);
    toast.warning({ title: 'Borrador eliminado', description: `Borrador ${draft.folio} eliminado.` });
  }

  function recoverTemporary() {
    if (!recovery) return;
    setForm({ ...recovery.data, laborAmount: displayLaborAmount(recovery.data.laborAmount), customerNotes: recovery.data.customerNotes ?? '' });
    setActiveDraft(drafts.find((draft) => draft.id === recovery.draftId) ?? null);
    setRecovery(null); setDirty(false); setSaveState('saved');
  }

  function discardTemporary() {
    quoteDraftService.deleteTemporary();
    setRecovery(null);
  }

  return {
    form, errors, totals, suggestions, customers, busy, saveState,
    editId, quotationToEdit, drafts, activeDraft, recovery,
    isLoadingEdit: Boolean(editId) && (!editReady || loadedEditId.current !== editId || isLoading),
    isSaved: !dirty && (Boolean(activeDraft) || Boolean(editId)),
    updateField, updateCustomer, selectCustomer, addItem, updateItem, deleteItem, setLaborAmount,
    submit, saveDraft, clearForm, openDraft, deleteDraft, recoverTemporary, discardTemporary,
  };
}
