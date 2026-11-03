import type { FormEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { BorradoresPanel } from '../components/newQuote/BorradoresPanel';
import { ClienteCard } from '../components/newQuote/ClienteCard';
import { DetallesCard } from '../components/newQuote/DetallesCard';
import { RefaccionesCard } from '../components/newQuote/RefaccionesCard';
import { ResumenCard } from '../components/newQuote/ResumenCard';
import { SaveStatusBadge } from '../components/newQuote/SaveStatusBadge';
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
    <div className="flex justify-end px-8 pt-6"><SaveStatusBadge saved={state.isSaved} /></div>
    {!editId && <span role="status" className="sr-only">{saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? 'Guardado automáticamente' : 'Guardado automático'}</span>}
    <form onSubmit={handleSubmit} noValidate className="flex flex-wrap items-start gap-6 px-8 pb-10 pt-4">
      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
        {!editId && <BorradoresPanel drafts={state.drafts} hasRecovery={Boolean(state.recovery)} onRecover={state.recoverTemporary} onDiscard={state.discardTemporary} onOpen={state.openDraft} onDelete={state.deleteDraft} />}
        {editId && quotationToEdit && <p className="flex items-center gap-2 text-xs font-medium text-mac-accent-text"><RotateCcw size={14} aria-hidden="true" />Editando cotización {quotationToEdit.folio}</p>}
        {!editId && activeDraft && <p className="flex items-center gap-2 text-xs font-medium text-mac-accent-text"><RotateCcw size={14} aria-hidden="true" />Editando borrador {activeDraft.folio}</p>}
        <div className="flex flex-wrap gap-5">
          <ClienteCard form={form} errors={errors} customers={state.customers} onChange={state.updateField} onCustomerChange={state.updateCustomer} onSelectCustomer={state.selectCustomer} />
          <VehiculoCard form={form} errors={errors} onChange={state.updateField} />
        </div>
        <RefaccionesCard form={form} errors={errors} suggestions={state.suggestions} totalParts={totals.subtotalRefacciones} onAdd={state.addItem} onUpdate={state.updateItem} onDelete={state.deleteItem} />
        <DetallesCard form={form} errors={errors} onChange={state.updateField} />
      </div>
      <ResumenCard form={form} totals={totals} errors={errors} busy={state.busy} onChange={state.updateField} onLaborChange={state.setLaborAmount} onSaveDraft={editId ? undefined : state.saveDraft} onClear={editId ? undefined : state.clearForm} submitLabel={editId ? 'Guardar cambios' : 'Guardar cotización'} />
    </form>
  </div>;
}
