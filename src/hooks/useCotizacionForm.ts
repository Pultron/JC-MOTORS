import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { useUnsavedGuard } from './useUnsavedGuard';
import { shouldBlockNavigation } from '../services/workshopForm';
import { useNavigate, useSearchParams } from 'react-router';
import { useToast } from '../components/ui/Toast';
import { useChoose, useConfirm } from './useConfirm';
import { useDuplicateCustomerPrompt } from './useDuplicateCustomerPrompt';
import { resolveCustomerSave } from '../services/customerMatching';
import type { CustomerSaveAction } from '../services/customerMatching';
import type { QuoteDraft, QuoteDraftItem, QuoteFormData } from '../models/quoteDraft';
import type { CreateQuotationInput, CustomerProfile, Quotation } from '../models/quotation';
import { quoteDraftService } from '../services/quoteDraftService';
import { MAX_CONCEPTS } from '../services/quotationLayout';
import { TEMPLATES_CHANGED_EVENT, appendTemplateItems, quoteTemplateService } from '../services/quoteTemplateService';
import type { QuoteTemplate } from '../services/quoteTemplateService';
import { MAX_CONCEPTS_MESSAGE, normalizeQuoteForm, validateQuoteForm } from '../services/quoteValidation';
import { useCustomers } from '../store/CustomerContext';
import { useQuotations } from '../store/QuotationContext';
import { useShareQuotation } from '../store/ShareContext';
import { parseDecimal } from '../utils/currency';
import { AMOUNT_TOO_LARGE_MESSAGE, QuotationAmountError, calculateQuotationTotals, countZeroPriceItems, createId } from '../utils/quotation';
import type { QuotationTotals } from '../utils/quotation';
import { buildQuotationInput } from '../services/quotationFromForm';
import { DISCOUNT_CLAMP_MESSAGES, clampDiscount } from '../utils/discountClamp';
import { focusFirstInvalid } from '../utils/focusFirstInvalid';
import { formatMoney } from '../utils/money';
import { amountValue, formatPhone, normalizeEmail, normalizePlates, sanitizeSingleLine, stripLineBreaks, normalizePhone, parseDecimalStrict, phoneForStorage, PHONE_DIGITS } from '../validation/fields';
import { titleCaseName } from '../validation/liveFormat';

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
    customerId: quotation.customerId ?? '', customerName: quotation.customer.name, phone: formatPhone(quotation.customer.phone),
    email: quotation.customer.email ?? '', make: quotation.vehicle.make, model: quotation.vehicle.model,
    year: quotation.vehicle.year ? String(quotation.vehicle.year) : '', plates: quotation.vehicle.plates,
    items: parts.length ? parts : [blankItem('')], laborAmount: displayLaborAmount(String(laborAmount)),
    laborDiscountType: quotation.laborDiscountType, laborDiscountValue: String(quotation.laborDiscountValue),
    ivaEnabled: quotation.includeVat, validityDays: String(quotation.validityDays),
    publicNotes: quotation.publicNotes, customerNotes: quotation.customerNotes ?? '',
  };
}

const FIRST_FIELD_SELECTOR = '[data-testid="cliente-nombre"]';

/** Puts the cursor in the first field of the form (customer name). */
export function focusFirstField(): void {
  document.querySelector<HTMLElement>(FIRST_FIELD_SELECTOR)?.focus();
}

const ZERO_TOTALS: QuotationTotals = { subtotalRefacciones: 0, subtotalManoObra: 0, laborDiscount: 0, subtotalNeto: 0, ivaAmount: 0, total: 0 };

function calculateFormTotals(form: QuoteFormData): { totals: QuotationTotals; amountOverflow: boolean } {
  const labor = amountValue(form.laborAmount);
  try {
    return {
      amountOverflow: false,
      totals: calculateQuotationTotals(
        [
          ...form.items.map((item) => ({ type: item.type, quantity: parseDecimal(item.quantity), saleUnitPrice: amountValue(item.unitPrice) })),
          ...(labor > 0 ? [{ type: 'labor' as const, quantity: 1, saleUnitPrice: labor }] : []),
        ],
        form.laborDiscountType, Number(form.laborDiscountValue) || 0, form.ivaEnabled,
      ),
    };
  } catch (error) {
    if (!(error instanceof QuotationAmountError)) throw error;
    return { amountOverflow: true, totals: ZERO_TOTALS };
  }
}

/** Estado, cálculos derivados y acciones de la pantalla "Nueva cotización". */
export function useCotizacionForm() {
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('editar') ?? undefined;
  const navigate = useNavigate();
  const { customers, createCustomer, updateCustomer: updateStoredCustomer } = useCustomers();
  const askDuplicateCustomer = useDuplicateCustomerPrompt();
  const { quotations, isLoading, createQuotation, updateQuotation } = useQuotations();
  const toast = useToast();
  const confirm = useConfirm();
  const choose = useChoose();
  // Editing a saved quotation has no autosave: leaving with unsaved changes must ask first.
  const skipGuard = useRef(false);
  const { offerAfterSave } = useShareQuotation();
  const [form, setForm] = useState<QuoteFormData>(emptyForm);
  const [editReady, setEditReady] = useState(!editId);
  const [drafts, setDrafts] = useState<QuoteDraft[]>(() => quoteDraftService.list());
  const [activeDraft, setActiveDraft] = useState<QuoteDraft | null>(null);
  // The old automatic copy is gone: leaving now asks to save as a draft, so a stale copy is discarded once.
  useEffect(() => { quoteDraftService.deleteTemporary(); }, []);
  // Errors appear after the user leaves a field (blur) or after a failed submit, then stay live until fixed.
  const [touched, setTouched] = useState<Record<string, true>>({});
  const [limitError, setLimitError] = useState('');
  // Bumped after a failed submit; the effect below runs once the errors are rendered.
  const [focusRequest, setFocusRequest] = useState(0);
  const [discountFlash, setDiscountFlash] = useState(0);
  const clampNotified = useRef(false);
  const customerNameEdited = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const loadedEditId = useRef<string | null>(null);
  const quotationToEdit = quotations.find((quotation) => quotation.id === editId);

  useEffect(() => {
    if (!editId || isLoading) return;
    if (loadedEditId.current === editId) return;
    if (!quotationToEdit || quotationToEdit.status !== 'Pendiente') {
      skipGuard.current = true;
      navigate(quotationToEdit ? `/cotizaciones/${editId}` : '/historial', { replace: true });
      return;
    }
    loadedEditId.current = editId;
    setForm(formFromQuotation(quotationToEdit));
    setActiveDraft(null);
    setDirty(false);
    setEditReady(true);
  }, [editId, isLoading, quotationToEdit, navigate]);

  const { totals, amountOverflow } = useMemo(() => calculateFormTotals(form), [form.items, form.laborAmount, form.laborDiscountType, form.laborDiscountValue, form.ivaEnabled]);

  useEffect(() => {
    if (amountOverflow) toast.error({ title: AMOUNT_TOO_LARGE_MESSAGE, description: 'Revisa cantidades y precios; el total no se puede calcular.' });
  }, [amountOverflow, toast]);

  const allErrors = useMemo(() => validateQuoteForm(form, totals), [form, totals]);
  const errors = useMemo(() => {
    const visible: Record<string, string> = {};
    for (const [key, message] of Object.entries(allErrors)) if (touched[key]) visible[key] = message;
    if (limitError) visible.items = limitError;
    return visible;
  }, [allErrors, touched, limitError]);

  useEffect(() => {
    if (focusRequest > 0) focusFirstInvalid();
  }, [focusRequest]);

  function touch(...keys: string[]) {
    setTouched((current) => keys.every((key) => current[key]) ? current : { ...current, ...Object.fromEntries(keys.map((key) => [key, true as const])) });
  }

  // Description suggestions come only from the concepts the user saved in "Conceptos".
  const [savedConcepts, setSavedConcepts] = useState(() => quoteTemplateService.list());
  useEffect(() => {
    const reload = () => setSavedConcepts(quoteTemplateService.list());
    window.addEventListener(TEMPLATES_CHANGED_EVENT, reload);
    return () => window.removeEventListener(TEMPLATES_CHANGED_EVENT, reload);
  }, []);
  const suggestions = useMemo(() => Array.from(new Set(
    savedConcepts.flatMap((concept) => concept.items.map((item) => item.description)),
  )).sort((a, b) => a.localeCompare(b, 'es-MX')), [savedConcepts]);

  useEffect(() => {
    if (!form.laborDiscountValue.trim()) return;
    const value = Number(form.laborDiscountValue);
    if (!Number.isFinite(value)) return;
    const { bounded, limit } = clampDiscount(form.laborDiscountType, value, totals.subtotalManoObra);
    if (limit === null) {
      // Back below the maximum: the next clamp is a new event and gets its own notice.
      if (bounded < (form.laborDiscountType === 'percentage' ? 100 : totals.subtotalManoObra)) clampNotified.current = false;
      return;
    }
    setForm((current) => ({ ...current, laborDiscountValue: String(bounded) }));
    // One notice per clamp, not per keystroke while the labor amount keeps shrinking.
    if (clampNotified.current) return;
    clampNotified.current = true;
    toast.info({ title: DISCOUNT_CLAMP_MESSAGES[limit] });
    setDiscountFlash((current) => current + 1);
  }, [form.laborDiscountType, form.laborDiscountValue, totals.subtotalManoObra, toast]);

  function updateField<K extends keyof QuoteFormData>(key: K, value: QuoteFormData[K]) {
    // Single-line fields never keep newlines or tabs, also when they arrive through paste.
    const next = typeof value === 'string' && key !== 'publicNotes' && key !== 'customerNotes' ? stripLineBreaks(value) as QuoteFormData[K] : value;
    setForm((current) => ({ ...current, [key]: next }));
    if (key === 'year') touch('year');
    setDirty(true);
  }

  function updateCustomer(raw: string) {
    const value = stripLineBreaks(raw);
    customerNameEdited.current = true;
    // Nothing autofills while typing: matching saved customers are offered as an opt-in suggestion in ClienteCard.
    setForm((current) => ({ ...current, customerId: '', customerName: value, ...(current.customerId ? { phone: '', email: '' } : {}) }));
    setDirty(true);
  }

  function selectCustomer(id: string) {
    const customer = customers.find((item) => item.id === id);
    if (!customer) return;
    customerNameEdited.current = false;
    setForm((current) => ({ ...current, customerId: id, customerName: customer.name, phone: formatPhone(customer.phone), email: customer.email ?? '' }));
    setDirty(true);
  }

  /** Blur on free-text fields that validate only on submit: collapses repeated spaces and trims. */
  function commitText(key: 'customerName' | 'make' | 'model') {
    // Title case only applies to a name the user typed in this session and that is not a saved customer.
    const titleCase = key === 'customerName' && customerNameEdited.current;
    if (key === 'customerName') customerNameEdited.current = false;
    setForm((current) => {
      const cleaned = sanitizeSingleLine(current[key]);
      const clean = titleCase && !current.customerId ? titleCaseName(cleaned) : cleaned;
      return clean === current[key] ? current : { ...current, [key]: clean };
    });
  }

  /** Blur: marks the field as touched (errors start showing) and applies its normalization. */
  function blurField(key: 'phone' | 'email' | 'plates' | 'laborAmount') {
    // An empty phone/email is only reported on submit ("Agrega un teléfono o un correo"), not just for tabbing through.
    if (!((key === 'phone' || key === 'email') && form[key] === '')) touch(key);
    if (key === 'email' || key === 'plates') {
      setForm((current) => {
        const clean = key === 'email' ? normalizeEmail(sanitizeSingleLine(current.email)) : normalizePlates(current.plates);
        return clean === current[key] ? current : { ...current, [key]: clean };
      });
    }
    if (key === 'laborAmount') {
      const parsed = parseDecimalStrict(form.laborAmount);
      if (parsed.ok && parsed.texto !== form.laborAmount) setForm((current) => ({ ...current, laborAmount: parsed.texto }));
    }
    if (key === 'phone') {
      const digits = normalizePhone(form.phone);
      if (digits.length === PHONE_DIGITS && form.phone !== formatPhone(digits)) setForm((current) => ({ ...current, phone: formatPhone(digits) }));
    }
  }

  function addItem(description = '') {
    if (form.items.length >= MAX_CONCEPTS) {
      setLimitError(MAX_CONCEPTS_MESSAGE);
      return;
    }
    const only = form.items.length === 1 ? form.items[0] : undefined;
    if (description && only && !only.description.trim() && !only.unitPrice.trim()) {
      updateField('items', [{ ...only, description }]);
    } else {
      updateField('items', [...form.items, blankItem(description)]);
    }
    setLimitError('');
  }

  /** Appends the template's concepts (editable copies) without exceeding the concept cap. */
  function applyTemplate(template: QuoteTemplate) {
    const result = appendTemplateItems(form.items, template, MAX_CONCEPTS);
    const total = template.items.length;
    if (result.added === 0) {
      toast.warning({ title: 'No se agregaron conceptos', description: `La cotización ya tiene el máximo de ${MAX_CONCEPTS} conceptos.` });
      return;
    }
    updateField('items', result.items);
    setLimitError('');
    if (result.skipped > 0) {
      toast.warning({ title: 'El concepto no cupo completo', description: `Se agregaron ${result.added} de ${total} conceptos: el máximo es ${MAX_CONCEPTS} por cotización.` });
    } else {
      toast.success({ title: 'Concepto agregado', description: `Se agregaron ${result.added} ${result.added === 1 ? 'concepto' : 'conceptos'} de “${template.name}”. Puedes editarlos.` });
    }
  }

  function updateItem(id: string, key: keyof Omit<QuoteDraftItem, 'id' | 'type'>, value: string) {
    const next = key === 'description' ? stripLineBreaks(value) : value;
    setForm((current) => {
      const items = current.items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [key]: next } as QuoteDraftItem;
        // Picking (or typing) a saved concept also brings its price, unless the user already set one.
        if (key === 'description' && item.unitPrice.trim() === '') {
          const saved = savedConcepts.flatMap((concept) => concept.items).find((candidate) => candidate.unitPrice.trim() !== '' && normalize(candidate.description) === normalize(next));
          if (saved) updated.unitPrice = saved.unitPrice;
        }
        return updated;
      });
      return { ...current, items };
    });
    setDirty(true);
  }

  function blurItem(id: string, key: 'description' | 'quantity' | 'unitPrice') {
    if (key === 'description') {
      setForm((current) => ({
        ...current,
        items: current.items.map((item) => item.id === id && sanitizeSingleLine(item.description) !== item.description ? { ...item, description: sanitizeSingleLine(item.description) } : item),
      }));
      return;
    }
    touch(`item-${id}-${key}`);
    if (key === 'unitPrice') {
      setForm((current) => ({
        ...current,
        items: current.items.map((item) => {
          const parsed = item.id === id ? parseDecimalStrict(item.unitPrice) : null;
          return parsed?.ok && parsed.texto !== item.unitPrice ? { ...item, unitPrice: parsed.texto } : item;
        }),
      }));
    }
  }

  function deleteItem(id: string) {
    const items = form.items.filter((item) => item.id !== id);
    updateField('items', items.length ? items : [blankItem('')]);
  }

  function setLaborAmount(value: string) {
    setForm((current) => ({ ...current, laborAmount: value, ...(amountValue(value) > 0 || current.laborDiscountType === 'percentage' ? {} : { laborDiscountValue: '0' }) }));
    setDirty(true);
  }

  /** Validates the canonical form (money parsed strictly) and reveals every failing field. */
  function validate(candidate: QuoteFormData): boolean {
    const { totals: candidateTotals, amountOverflow: overflow } = calculateFormTotals(candidate);
    const next = validateQuoteForm(candidate, candidateTotals);
    touch(...Object.keys(next));
    if (overflow) {
      toast.error({ title: AMOUNT_TOO_LARGE_MESSAGE });
      return false;
    }
    return Object.keys(next).length === 0;
  }

  /** Customer details are complete and valid, but the person is not saved in Clientes yet. */
  const canSaveCustomer = !form.customerId && form.customerName.trim() !== '' && (form.phone.trim() !== '' || form.email.trim() !== '')
    && !allErrors.customerName && !allErrors.phone && !allErrors.email;

  /** The linked customer exists but the form carries a valid phone/email that differs from what is stored. */
  const linkedCustomer = form.customerId ? customers.find((customer) => customer.id === form.customerId) : undefined;
  const customerChanges = (() => {
    if (!linkedCustomer || allErrors.phone || allErrors.email) return null;
    const phone = normalizePhone(form.phone) ? phoneForStorage(form.phone) : '';
    const email = form.email.trim();
    // Empty fields never erase what is stored; only new or different values count as a change.
    const phoneChanged = phone !== '' && normalizePhone(phone) !== normalizePhone(linkedCustomer.phone);
    const emailChanged = email !== '' && email.toLocaleLowerCase('es-MX') !== (linkedCustomer.email ?? '').toLocaleLowerCase('es-MX');
    return phoneChanged || emailChanged ? { phone: phoneChanged ? phone : linkedCustomer.phone, email: emailChanged ? email : linkedCustomer.email } : null;
  })();
  const canUpdateCustomer = customerChanges !== null;

  function updateLinkedCustomer() {
    if (!linkedCustomer || !customerChanges) return;
    updateStoredCustomer(linkedCustomer.id, { name: linkedCustomer.name, phone: customerChanges.phone, ...(customerChanges.email ? { email: customerChanges.email } : {}), aliases: linkedCustomer.aliases });
    toast.success({ title: 'Datos actualizados', description: `Se actualizaron los datos de ${linkedCustomer.name} en Clientes.` });
  }

  /** Explicit opt-in: stores the typed customer in Clientes and links the quotation to it. */
  async function saveAsCustomer() {
    if (!canSaveCustomer) return;
    const clean = normalizeQuoteForm(form);
    const action = await resolveCustomerSave(customers, { name: clean.customerName, phone: clean.phone, email: clean.email }, askDuplicateCustomer);
    if (action.action === 'cancel') return;
    let saved: CustomerProfile;
    if (action.action === 'create') {
      saved = createCustomer({ name: clean.customerName.trim(), phone: phoneForStorage(clean.phone), ...(clean.email.trim() ? { email: clean.email.trim() } : {}), aliases: [] });
    } else {
      saved = action.customer;
      if (action.action === 'updatePhone') updateStoredCustomer(saved.id, { name: saved.name, phone: action.phone, ...(saved.email ? { email: saved.email } : {}), aliases: saved.aliases });
    }
    setForm((current) => ({ ...current, customerId: saved.id }));
    setDirty(true);
    toast.success({ title: 'Cliente guardado', description: `${saved.name} ya está en Clientes.` });
  }

  async function submit() {
    const clean = normalizeQuoteForm(form);
    if (!validate(clean)) {
      setForm(clean);
      setFocusRequest((current) => current + 1);
      return;
    }
    // Decided before anything is saved: "Cancelar" leaves the quote and the customers untouched.
    // Customer side effects are applied only after the quote is saved.
    let customerAction: CustomerSaveAction | null = null;
    if (!clean.customerId) {
      customerAction = await resolveCustomerSave(customers, { name: clean.customerName, phone: clean.phone, email: clean.email }, askDuplicateCustomer);
      if (customerAction.action === 'cancel') return;
      if (customerAction.action !== 'create') clean.customerId = customerAction.customer.id;
    }
    const input: CreateQuotationInput = buildQuotationInput(clean, activeDraft?.folio);
    setBusy(true);
    try {
      const quote = editId
        ? await updateQuotation(editId, input)
        : await createQuotation(input);
      if (!quote) {
        toast.warning({ title: 'Cotización no editable', description: 'Esta cotización ya no está pendiente y no se puede editar.' });
        return;
      }
      // A new customer is never saved implicitly: the user opts in with "Guardar como cliente frecuente".
      if (customerAction?.action === 'updatePhone') {
        const { customer, phone } = customerAction;
        updateStoredCustomer(customer.id, { name: customer.name, phone, ...(customer.email ? { email: customer.email } : {}), aliases: customer.aliases });
      }
      const zeroPriced = countZeroPriceItems(input.items);
      if (zeroPriced > 0) {
        toast.info({ title: `${zeroPriced} ${zeroPriced === 1 ? 'concepto' : 'conceptos'} en ${formatMoney(0)}`, description: 'La cotización se guardó con conceptos sin costo. Revisa que sea intencional.' });
      }
      if (!editId) {
        if (activeDraft) quoteDraftService.delete(activeDraft.id);
        setDirty(false);
      }
      skipGuard.current = true;
      navigate('/historial');
      // Persistent confirmation (not a 5-second toast) with the send buttons; it stays over the history screen.
      offerAfterSave(quote);
    } catch (error) {
      if (error instanceof QuotationAmountError) toast.error({ title: AMOUNT_TOO_LARGE_MESSAGE });
      else toast.error({ title: 'Error al guardar', description: 'No se pudo guardar la cotización. Inténtalo de nuevo.' });
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(): Promise<boolean> {
    setBusy(true);
    try {
      const saved = await quoteDraftService.save(form, activeDraft ?? undefined);
      setActiveDraft(saved);
      setDrafts(quoteDraftService.list());
      setDirty(false);
      toast.success({ title: 'Borrador guardado', description: `El borrador ${saved.folio} se guardó correctamente.` });
      return true;
    } catch {
      toast.error({ title: 'Error al guardar', description: 'No se pudo guardar el borrador.' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function clearForm() {
    const accepted = await confirm({ title: '¿Limpiar el formulario?', description: 'Se borrarán todos los datos capturados en esta cotización.', confirmLabel: 'Limpiar formulario', tone: 'danger' });
    if (!accepted) return;
    resetToEmpty();
    toast.info({ title: 'Formulario limpio.' });
  }

  function resetToEmpty() {
    setForm(emptyForm()); setActiveDraft(null); setTouched({}); setLimitError(''); setDirty(false);
  }

  /** Leaves the open draft without saving: the draft stays as it was last saved and the form starts empty. */
  async function leaveDraft() {
    if (!activeDraft) return;
    if (dirty) {
      const accepted = await confirm({ title: '¿Salir del borrador?', description: `Los cambios sin guardar de ${activeDraft.folio} se perderán. El borrador conserva su última versión guardada.`, confirmLabel: 'Salir sin guardar', tone: 'danger' });
      if (!accepted) return;
    }
    resetToEmpty();
    toast.info({ title: 'Saliste del borrador', description: 'El formulario quedó limpio.' });
  }

  async function openDraft(draft: QuoteDraft) {
    if (dirty && !(await confirm({ title: '¿Abrir este borrador?', description: 'Se reemplazarán los datos del formulario actual.', confirmLabel: 'Abrir borrador' }))) return;
    setForm({ ...draft.data, laborAmount: displayLaborAmount(draft.data.laborAmount), customerNotes: draft.data.customerNotes ?? '' });
    setActiveDraft(draft); setTouched({}); setLimitError(''); setDirty(false);
    toast.info({ title: 'Borrador abierto', description: `Borrador ${draft.folio} abierto.` });
  }

  async function deleteDraft(draft: QuoteDraft) {
    const accepted = await confirm({ title: '¿Eliminar este borrador?', description: `El borrador ${draft.folio} se eliminará definitivamente.`, confirmLabel: 'Eliminar borrador', tone: 'danger' });
    if (!accepted) return;
    quoteDraftService.delete(draft.id);
    setDrafts(quoteDraftService.list());
    // Deleting the draft that is open also clears the form, otherwise its data would linger unsaved.
    if (activeDraft?.id === draft.id) resetToEmpty();
    toast.warning({ title: 'Borrador eliminado', description: `Borrador ${draft.folio} eliminado.` });
  }

  const guardActive = dirty;
  const guardRef = useRef(guardActive);
  guardRef.current = guardActive;
  async function askToLeaveEdit(reason: 'navigate' | 'close' = 'navigate'): Promise<boolean> {
    if (editId) {
      return confirm({ title: '¿Salir sin guardar?', description: 'Tienes cambios sin guardar en esta cotización. Si sales ahora se perderán.', confirmLabel: 'Salir sin guardar', cancelLabel: 'Seguir editando', tone: 'danger' });
    }
    const choice = await choose({ title: '¿Guardar como borrador?', description: 'Tienes datos capturados sin guardar. Guárdalos como borrador para continuar después.', confirmLabel: 'Guardar como borrador', secondaryLabel: 'Salir sin guardar', cancelLabel: 'Seguir editando' });
    // Save only: the draft is stored, the form is cleared (not left "inside" the draft) and the user stays on this screen.
    if (choice === 'primary') {
      if (!(await saveDraft())) return false;
      resetToEmpty();
      return reason === 'close';
    }
    return choice === 'secondary';
  }
  const askToLeaveRef = useRef(askToLeaveEdit);
  askToLeaveRef.current = askToLeaveEdit;
  useUnsavedGuard(guardActive, () => askToLeaveRef.current('close'));
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !skipGuard.current && shouldBlockNavigation(guardRef.current, currentLocation, nextLocation));
  const askingRef = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || askingRef.current) return;
    askingRef.current = true;
    void askToLeaveRef.current().then((canLeave) => {
      askingRef.current = false;
      if (canLeave) blocker.proceed(); else blocker.reset();
    });
    // The prompt reads everything through refs, so only the blocker state drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);

  return {
    form, errors, totals, discountFlash, suggestions, customers, busy,
    editId, quotationToEdit, drafts, activeDraft,
    isLoadingEdit: Boolean(editId) && (!editReady || loadedEditId.current !== editId || isLoading),
    isSaved: !dirty && (Boolean(activeDraft) || Boolean(editId)),
    updateField, blurField, commitText, blurItem, updateCustomer, selectCustomer, canSaveCustomer, saveAsCustomer, canUpdateCustomer, updateLinkedCustomer, addItem, applyTemplate, updateItem, deleteItem, setLaborAmount,
    submit, saveDraft, clearForm, leaveDraft, openDraft, deleteDraft,
  };
}
