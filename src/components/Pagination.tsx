import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

const NAV_BUTTON = 'inicio-btn grid size-8 place-items-center rounded-lg text-mac-ink-2 hover:bg-mac-fill hover:text-mac-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent';

export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  if (pageCount <= 1) return null;

  const hasPrevious = page > 1;
  const hasNext = page < pageCount;

  return (
    <nav aria-label="Paginación de cotizaciones" className="flex items-center gap-1">
      <button
        type="button"
        className={NAV_BUTTON}
        disabled={!hasPrevious}
        aria-label="Página anterior"
        data-testid="pagina-anterior"
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>

      {buildVisiblePages(page, pageCount).map((entry, index) => entry === 'gap'
        ? <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-sm text-mac-ink-2">…</span>
        : <button
          key={entry}
          type="button"
          aria-label={`Página ${entry}`}
          aria-current={entry === page ? 'page' : undefined}
          data-testid={`pagina-${entry}`}
          className={`inicio-btn grid size-8 place-items-center rounded-lg text-[13px] font-semibold tabular-nums ${entry === page ? 'bg-mac-accent text-white shadow-[0_1px_2px_rgb(120_40_0/35%),inset_0_1px_0_rgb(255_255_255/18%)]' : 'text-mac-ink hover:bg-mac-fill'}`}
          onClick={() => onPageChange(entry)}
        >
          {entry}
        </button>)}

      <button
        type="button"
        className={NAV_BUTTON}
        disabled={!hasNext}
        aria-label="Página siguiente"
        data-testid="pagina-siguiente"
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}

type PageEntry = number | 'gap';

/** Con muchas páginas se muestra una ventana alrededor de la actual en lugar de todos los números. */
function buildVisiblePages(page: number, pageCount: number): PageEntry[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const wanted = [...new Set([1, pageCount, page - 1, page, page + 1])]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);

  const entries: PageEntry[] = [];
  let previous = 0;
  for (const value of wanted) {
    if (previous && value - previous > 1) entries.push('gap');
    entries.push(value);
    previous = value;
  }
  return entries;
}
