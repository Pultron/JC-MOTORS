import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '../newQuote/primitives/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { ChoiceResult } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { summarizeCurrent } from '../../storage/backupService';
import { buildWipeSummary, isWipeConfirmText, onDatosBorrados, wipeAllData, WIPE_CONFIRM_WORD } from '../../services/wipeService';
import type { WipeCounts } from '../../services/wipeService';
import { userMessage } from '../../utils/userMessage';

interface Props {
  /** Another operation on the page is running. */
  disabled?: boolean;
  /** Lets the page disable its own buttons while the wipe runs. */
  onBusyChange?: (busy: boolean) => void;
}

const IRREVERSIBLE = 'Esta acción no se puede deshacer. Antes de borrar se guardará una copia automática.';

/** "Zona de peligro" at the bottom of the Respaldo page: delete everything and start from zero. */
export function WipeDangerZone({ disabled = false, onBusyChange }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<WipeCounts>({ quotations: 0, customers: 0, invoices: 0 });
  const [includeWorkshop, setIncludeWorkshop] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  function openDialog() {
    // Fresh counts at the moment of asking, not at page load.
    const current = summarizeCurrent();
    setCounts({ quotations: current.quotations, customers: current.customers, invoices: current.invoices });
    setIncludeWorkshop(false);
    setText('');
    setOpen(true);
  }

  async function runWipe(withWorkshop: boolean) {
    setBusy(true);
    onBusyChange?.(true);
    try {
      await wipeAllData({ includeWorkshop: withWorkshop });
      onDatosBorrados(); // Reloads the window; the page stays busy until then.
    } catch (error) {
      toast.error({ title: 'No se pudo borrar', description: userMessage(error, 'borrar-datos') });
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  function handleResolve(result: ChoiceResult) {
    setOpen(false);
    if (result === 'primary' && isWipeConfirmText(text)) void runWipe(includeWorkshop);
  }

  return <>
    <section aria-labelledby="respaldo-danger-title" className="respaldo-danger">
      <p id="respaldo-danger-title" className="respaldo-danger-label">Zona de peligro</p>
      <Card as="div" className="respaldo-danger-card">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span aria-hidden="true" className="respaldo-danger-icon"><AlertTriangle size={18} /></span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight text-mac-ink">Borrar todos los datos</h2>
            <p className="mt-0.5 text-[13px] leading-snug text-mac-ink-2">Elimina cotizaciones, clientes y facturas para empezar de cero. Antes se guarda una copia automática.</p>
          </div>
        </div>
        <div className="flex justify-end px-4 pb-3.5 pt-1">
          <button type="button" data-testid="wipe-open" className="mac-btn mac-btn-danger" disabled={disabled || busy} aria-busy={busy} onClick={openDialog}>
            {busy ? 'Borrando…' : 'Borrar todos los datos…'}
          </button>
        </div>
      </Card>
    </section>
    {open && <ConfirmDialog
      title="¿Borrar todos los datos?"
      description={`${buildWipeSummary(counts)} ${IRREVERSIBLE}`}
      confirmLabel="Borrar todo"
      tone="danger"
      confirmDisabled={!isWipeConfirmText(text)}
      onResolve={handleResolve}
      content={<>
        <label className="wipe-check">
          <input type="checkbox" data-testid="wipe-workshop" checked={includeWorkshop} onChange={(event) => setIncludeWorkshop(event.target.checked)} />
          <span>También borrar los datos del taller y el mensaje para clientes</span>
        </label>
        <label className="wipe-field">
          <span>Escribe {WIPE_CONFIRM_WORD} para confirmar</span>
          <input type="text" data-testid="wipe-confirm-text" data-autofocus className="mac-fill-input" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={text} onChange={(event) => setText(event.target.value)} />
        </label>
      </>}
    />}
  </>;
}
