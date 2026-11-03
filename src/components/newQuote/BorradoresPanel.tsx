import { FolderOpen, Trash2 } from 'lucide-react';
import type { QuoteDraft } from '../../models/quoteDraft';

interface Props {
  drafts: QuoteDraft[];
  hasRecovery: boolean;
  onRecover: () => void;
  onDiscard: () => void;
  onOpen: (draft: QuoteDraft) => void;
  onDelete: (draft: QuoteDraft) => void;
}

/** Banner de recuperación del autoguardado y lista de borradores guardados. */
export function BorradoresPanel({ drafts, hasRecovery, onRecover, onDiscard, onOpen, onDelete }: Props) {
  return <>
    {hasRecovery && <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-mac-info-bg p-4 text-sm text-mac-info-text">
      <span>Hay un formulario guardado automáticamente. ¿Deseas recuperarlo?</span>
      <div className="flex gap-2">
        <button type="button" data-testid="recuperar-autoguardado" className="mac-press h-11 rounded-[10px] bg-mac-accent px-4 font-semibold text-white hover:bg-mac-accent-hover" onClick={onRecover}>Recuperar</button>
        <button type="button" className="mac-press h-11 rounded-[10px] bg-white px-4 font-semibold shadow-[0_0_0_1px_rgb(0_0_0/0.12)]" onClick={onDiscard}>Descartar</button>
      </div>
    </div>}
    {drafts.length > 0 && <section className="rounded-[14px] bg-white px-4 py-3 shadow-mac-card">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FolderOpen size={17} aria-hidden="true" className="text-mac-accent-text" />Borradores guardados</h2>
      <div className="flex flex-wrap gap-2">{drafts.map((draft) => <div key={draft.id} className="flex items-center rounded-lg bg-mac-fill pl-3 text-xs">
        <button type="button" className="mac-press min-h-11 font-semibold text-mac-accent-text hover:underline" onClick={() => onOpen(draft)}>{draft.folio} · {draft.data.customerName || 'Sin cliente'}</button>
        <button type="button" className="mac-press flex size-11 items-center justify-center rounded-lg text-mac-ink-2 hover:text-mac-danger" aria-label={`Eliminar borrador ${draft.folio}`} onClick={() => onDelete(draft)}><Trash2 size={14} aria-hidden="true" /></button>
      </div>)}</div>
    </section>}
  </>;
}
