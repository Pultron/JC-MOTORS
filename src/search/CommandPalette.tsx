import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Search, SearchX } from 'lucide-react';
import { useNavigate } from 'react-router';
import { EmptyState } from '../components/ui/EmptyState';
import type { Invoice } from '../models/invoice';
import { createInvoiceRepository } from '../repositories/repositoryFactory';
import { useCustomers } from '../store/CustomerContext';
import { useQuotations } from '../store/QuotationContext';
import '../styles/palette.css';
import { moveActive, searchAll } from './globalSearch';
import type { GlobalResult } from './globalSearch';
import { useDebouncedValue } from './useDebouncedValue';

interface PaletteApi { open: () => void }
const PaletteContext = createContext<PaletteApi>({ open: () => undefined });
export const useCommandPalette = () => useContext(PaletteContext);

/** Mounts the command palette. Nothing is indexed until the first time it opens. */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [opener, setOpener] = useState<HTMLElement | null | undefined>(undefined);
  const isOpen = opener !== undefined;
  const open = useCallback(() => setOpener((current) => (current !== undefined ? current : (document.activeElement as HTMLElement | null))), []);
  const close = useCallback(() => setOpener(undefined), []);
  const api = useMemo(() => ({ open }), [open]);
  return (
    <PaletteContext.Provider value={api}>
      {children}
      {isOpen && <PaletteDialog opener={opener ?? null} onClose={close} />}
    </PaletteContext.Provider>
  );
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function PaletteDialog({ opener, onClose }: { opener: HTMLElement | null; onClose: () => void }) {
  const navigate = useNavigate();
  const { quotations } = useQuotations();
  const { customers } = useCustomers();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query);
  const [active, setActive] = useState(-1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void createInvoiceRepository().getAll().then((all) => { if (!cancelled) setInvoices(all); });
    inputRef.current?.focus();
    return () => {
      cancelled = true;
      // Focus returns to where it was before the palette opened.
      queueMicrotask(() => { if (opener?.isConnected) opener.focus(); });
    };
  }, [opener]);

  // Newest first, like Historial: the palette is about getting back to recent work.
  const data = useMemo(() => ({
    quotations: [...quotations].sort((x, y) => y.createdAt.localeCompare(x.createdAt)),
    customers,
    invoices,
  }), [quotations, customers, invoices]);
  const groups = useMemo(() => searchAll(data, debounced), [data, debounced]);
  const flat = useMemo(() => groups.flatMap((group) => group.results), [groups]);
  const trimmed = debounced.trim();

  useEffect(() => { setActive(flat.length > 0 ? 0 : -1); }, [flat]);
  useEffect(() => {
    if (active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function openResult(result: GlobalResult | undefined) {
    if (!result) return;
    onClose();
    navigate(result.to);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => moveActive(current, event.key === 'ArrowDown' ? 1 : -1, flat.length));
    } else if (event.key === 'Enter' && event.target === inputRef.current && !event.nativeEvent.isComposing) {
      event.preventDefault();
      // The list lags the input by the debounce; resolve against what is typed right now.
      const current = query === debounced ? flat : searchAll(data, query).flatMap((group) => group.results);
      openResult(query === debounced ? current[active] : current[0]);
    } else if (event.key === 'Tab') {
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  let offset = 0;
  return (
    <div className="pal-backdrop" data-testid="palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="pal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
        data-testid="palette"
        onKeyDown={onKeyDown}
      >
        <div className="pal-input-row">
          <Search size={20} aria-hidden="true" />
          <input
            ref={inputRef}
            className="pal-input"
            data-testid="palette-input"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="pal-listbox"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-label="Buscar en cotizaciones, clientes y facturas"
            placeholder="Buscar cotizaciones, clientes y facturas"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd className="pal-esc" aria-hidden="true">Esc</kbd>
        </div>

        <span className="pal-live" aria-live="polite">{trimmed && flat.length > 0 ? `${flat.length} resultados` : ''}</span>

        <div className="pal-results">
          {groups.length === 0 ? (
            <EmptyState
              testId="palette-empty"
              icon={trimmed ? <SearchX size={22} /> : <Search size={22} />}
              title={trimmed ? `Sin resultados para «${trimmed}»` : 'Escribe para buscar en cotizaciones, clientes y facturas'}
            />
          ) : (
            <div role="listbox" id="pal-listbox" aria-label="Resultados">
              {groups.map((group) => {
                const start = offset;
                offset += group.results.length;
                return (
                  <div key={group.kind} role="group" aria-label={group.title} data-testid={`palette-group-${group.kind}`}>
                    <div className="pal-head" role="presentation">
                      <span aria-hidden="true">{group.title}</span>
                      <button type="button" className="pal-all" data-testid={`palette-all-${group.kind}`} aria-label={`Ver todos en ${group.title} (${group.total})`} onClick={() => { onClose(); navigate(group.seeAll); }}>
                        Ver todos{group.total > group.results.length ? ` (${group.total})` : ''}
                      </button>
                    </div>
                    {group.results.map((result, i) => {
                      const index = start + i;
                      return (
                        <div
                          key={result.key}
                          id={optionId(index)}
                          role="option"
                          aria-selected={index === active}
                          className="pal-option"
                          data-testid="palette-option"
                          data-key={result.key}
                          onMouseMove={() => { if (index !== active) setActive(index); }}
                          onClick={() => openResult(result)}
                        >
                          <div className="pal-main">
                            <div className="pal-title">{result.title}</div>
                            {result.subtitle && <div className="pal-sub">{result.subtitle}</div>}
                          </div>
                          {result.trailing && <span className="pal-trail">{result.trailing}</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const optionId = (index: number) => `pal-opt-${index}`;
