import type { FormEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { BorradoresPanel } from '../components/newQuote/BorradoresPanel';
import { ClienteCard } from '../components/newQuote/ClienteCard';
import { DetallesCard } from '../components/newQuote/DetallesCard';
import { RefaccionesCard } from '../components/newQuote/RefaccionesCard';
import { ResumenCard } from '../components/newQuote/ResumenCard';
import { VehiculoCard } from '../components/newQuote/VehiculoCard';
import { useCotizacionForm } from '../hooks/useCotizacionForm';

export function NuevaCotizacionPage() {
  const state = useCotizacionForm();
  const { form, errors, totals, editId, quotationToEdit, activeDraft, saveState } = state;

  if (state.isLoadingEdit) return <p className="py-16 text-center text-sm text-slate-500">Cargando cotización…</p>;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void state.submit();
  }

  return <div className="new-quotation-page">
    <h1 className="sr-only">Nueva cotización</h1>
    {!editId && <span role="status" className="sr-only">{saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? 'Guardado automáticamente' : 'Guardado automático'}</span>}
    <form onSubmit={handleSubmit} noValidate className="flex flex-wrap items-start gap-6 px-8 pb-10 pt-6">
      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
        {!editId && <BorradoresPanel drafts={state.drafts} hasRecovery={Boolean(state.recovery)} onRecover={state.recoverTemporary} onDiscard={state.discardTemporary} onOpen={state.openDraft} onDelete={state.deleteDraft} activeId={activeDraft?.id} onLeave={() => void state.leaveDraft()} />}
        {editId && quotationToEdit && <div role="status" data-testid="editando-cotizacion" className="flex items-center gap-3 rounded-[14px] border border-mac-accent bg-mac-tint px-4 py-3 shadow-mac-card">
          <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-full bg-mac-accent text-white"><RotateCcw size={17} /></span>
          <div className="min-w-0"><p className="text-sm font-semibold leading-tight text-mac-ink">Editando cotización <span className="rounded-md bg-mac-accent px-2 py-0.5 text-[13px] text-white">{quotationToEdit.folio}</span></p><p className="mt-1 text-xs text-mac-ink-2">Los cambios se aplican al guardar.</p></div>
        </div>}
        <div className="flex flex-wrap gap-5">
          <ClienteCard form={form} errors={errors} customers={state.customers} onChange={state.updateField} onCustomerChange={state.updateCustomer} onSelectCustomer={state.selectCustomer} onBlurField={state.blurField} onCommitText={state.commitText} canSaveCustomer={state.canSaveCustomer} onSaveCustomer={() => void state.saveAsCustomer()} />
          <VehiculoCard form={form} errors={errors} onChange={state.updateField} onBlurField={state.blurField} onCommitText={state.commitText} />
        </div>
        <RefaccionesCard form={form} errors={errors} suggestions={state.suggestions} totalParts={totals.subtotalRefacciones} onAdd={state.addItem} onUpdate={state.updateItem} onBlurItem={state.blurItem} onDelete={state.deleteItem} onApplyTemplate={state.applyTemplate} />
        <DetallesCard form={form} errors={errors} onChange={state.updateField} />
      </div>
      <ResumenCard discountFlash={state.discountFlash} form={form} totals={totals} errors={errors} busy={state.busy} onChange={state.updateField} onLaborChange={state.setLaborAmount} onLaborBlur={() => state.blurField('laborAmount')} onSaveDraft={editId ? undefined : state.saveDraft} onClear={editId ? undefined : state.clearForm} submitLabel={editId ? 'Guardar cambios' : 'Guardar cotización'} />
    </form>
  </div>;
}
