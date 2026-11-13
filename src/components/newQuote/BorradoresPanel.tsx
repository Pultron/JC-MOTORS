import { FolderOpen, LogOut, Trash2 } from 'lucide-react';
import type { QuoteDraft } from '../../models/quoteDraft';

interface Props {
  drafts: QuoteDraft[];
  onOpen: (draft: QuoteDraft) => void;
  onDelete: (draft: QuoteDraft) => void;
  /** Draft currently loaded in the form, if any. */
  activeId?: string;
  onLeave?: () => void;
}

/** Banner de recuperación del autoguardado y lista de borradores guardados. */
export function BorradoresPanel({ drafts, onOpen, onDelete, activeId, onLeave }: Props) {
  return <>
    {drafts.length > 0 && <section className="rounded-[14px] bg-white px-4 py-3 shadow-mac-card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><FolderOpen size={17} aria-hidden="true" className="text-mac-accent-text" />Borradores guardados<span className="rounded-full bg-mac-fill px-2 text-xs font-semibold text-mac-ink-2">{drafts.length}</span></h2>
        {activeId && onLeave && <button type="button" data-testid="borrador-salir" className="mac-press inline-flex h-8 items-center gap-1.5 rounded-full border border-mac-accent bg-mac-tint px-3.5 text-[13px] font-semibold text-mac-accent-text hover:bg-mac-accent hover:text-white" onClick={onLeave}><LogOut size={14} aria-hidden="true" />Salir del borrador</button>}
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]" role="list" aria-label="Borradores guardados">{drafts.map((draft) => {
        const active = draft.id === activeId;
        return <div key={draft.id} role="listitem" data-active={active ? 'true' : undefined} className={`flex shrink-0 items-center rounded-lg pl-3 text-xs ${active ? 'bg-mac-tint shadow-[inset_0_0_0_1.5px_var(--color-mac-accent)]' : 'bg-mac-fill'}`}>
          {active && <span aria-hidden="true" className="mr-2 size-2 rounded-full bg-mac-accent" />}
          <button type="button" aria-current={active ? 'true' : undefined} className="mac-press min-h-11 max-w-[220px] truncate font-semibold text-mac-accent-text hover:underline" title={active ? 'Editando este borrador' : undefined} onClick={() => onOpen(draft)}>{draft.folio} · {draft.data.customerName || 'Sin cliente'}</button>
          <button type="button" className="mac-press flex size-11 items-center justify-center rounded-lg text-mac-ink-2 hover:text-mac-danger" aria-label={`Eliminar borrador ${draft.folio}`} onClick={() => onDelete(draft)}><Trash2 size={14} aria-hidden="true" /></button>
        </div>;
      })}</div>
    </section>}
  </>;
}
