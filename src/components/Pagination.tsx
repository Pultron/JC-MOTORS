import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

const NAV_BUTTON = 'flex size-8 items-center justify-center rounded-lg border text-slate-500 transition disabled:cursor-not-allowed disabled:opacity-40';

export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  if (pageCount <= 1) return null;

  const hasPrevious = page > 1;
  const hasNext = page < pageCount;

  return (
    <nav aria-label="Paginación de cotizaciones" className="flex items-center gap-1.5">
      <button
        type="button"
        className={`${NAV_BUTTON} border-slate-200 bg-white hover:bg-slate-50`}
        disabled={!hasPrevious}
        aria-label="Página anterior"
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft size={16} />
      </button>

      {buildVisiblePages(page, pageCount).map((entry, index) => entry === 'gap'
        ? <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-sm text-slate-400">…</span>
        : <button
          key={entry}
          type="button"
          aria-label={`Página ${entry}`}
          aria-current={entry === page ? 'page' : undefined}
          className={`flex size-8 items-center justify-center rounded-lg text-sm font-semibold transition ${entry === page ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-navy-950'}`}
          onClick={() => onPageChange(entry)}
        >
          {entry}
        </button>)}

      <button
        type="button"
        className={`${NAV_BUTTON} border-slate-200 bg-white hover:bg-slate-50`}
        disabled={!hasNext}
        aria-label="Página siguiente"
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight size={16} />
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