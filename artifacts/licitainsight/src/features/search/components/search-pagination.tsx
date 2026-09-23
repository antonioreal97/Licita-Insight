import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination } from '@/api';
import { formatNumber } from '@/lib/format';
import { pageItems } from '../lib/pagination';

type Props = {
  pagination: Pagination;
  page: number;
  onPageChange: (page: number) => void;
  pageSizeControl?: ReactNode;
  /** Singular and plural of what is being paginated. */
  noun?: [singular: string, plural: string];
};

const base =
  'grid h-10 min-w-10 place-items-center rounded-lg border px-2 type-data text-xs transition-colors duration-fast ease-standard focus-visible:focus-ring sm:h-9 sm:min-w-9';

/**
 * Prev/next use `aria-disabled` instead of `disabled` at the ends: a disabled button drops keyboard focus to <body>
 * the moment the last page loads; an aria-disabled one keeps it and is announced as unavailable.
 */
export function SearchPagination({ pagination, page: requested, onPageChange, pageSizeControl, noun = ['oportunidade', 'oportunidades'] }: Props) {
  const { total, pageSize, totalPages, totalIsEstimate } = pagination;
  if (total === 0) return null;
  // An out-of-range `?page=` is corrected in the URL by the page; never render "Mostrando 19.961–19" meanwhile.
  const page = Math.min(Math.max(1, requested), Math.max(1, totalPages));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Paginação dos resultados"
      className="mt-5 flex flex-col-reverse items-center justify-between gap-3 text-xs text-muted-foreground @min-[46rem]/results:flex-row"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        {pageSizeControl}
        <span>
          Mostrando {formatNumber(first)}–{formatNumber(last)} de {totalIsEstimate ? 'aprox. ' : ''}
          {formatNumber(total)} {total === 1 ? noun[0] : noun[1]}
        </span>
      </div>
      {totalPages > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            <button
              type="button"
              aria-label="Página anterior"
              data-testid="button-previous-page"
              aria-disabled={page <= 1 || undefined}
              onClick={() => !(page <= 1) && onPageChange(page - 1)}
              className={`${base} border-border bg-surface text-foreground not-aria-disabled:hover:border-border-strong not-aria-disabled:hover:bg-surface-sunken aria-disabled:cursor-not-allowed aria-disabled:opacity-50`}
            >
              <ChevronLeft size={15} aria-hidden />
            </button>
          </li>
          {/* Compact "3 / 12" on phones; numbered pages with ellipses from sm up. */}
          <li className="px-2 type-data text-xs text-foreground sm:hidden" aria-current="page">
            {page} / {totalPages}
          </li>
          {pageItems(page, totalPages).map((item) =>
            typeof item === 'number' ? (
              <li key={item} className="hidden sm:block">
                <button
                  type="button"
                  aria-label={`Página ${item}`}
                  aria-current={item === page ? 'page' : undefined}
                  data-testid={`button-page-${item}`}
                  onClick={() => item !== page && onPageChange(item)}
                  className={`${base} ${item === page ? 'border-primary/40 bg-primary-subtle font-bold text-primary-subtle-foreground' : 'border-border bg-surface text-foreground hover:border-border-strong hover:bg-surface-sunken'}`}
                >
                  {item}
                </button>
              </li>
            ) : (
              <li key={item} aria-hidden className="hidden w-6 text-center sm:block">
                …
              </li>
            ),
          )}
          <li>
            <button
              type="button"
              aria-label="Próxima página"
              data-testid="button-next-page"
              aria-disabled={page >= totalPages || undefined}
              onClick={() => !(page >= totalPages) && onPageChange(page + 1)}
              className={`${base} border-border bg-surface text-foreground not-aria-disabled:hover:border-border-strong not-aria-disabled:hover:bg-surface-sunken aria-disabled:cursor-not-allowed aria-disabled:opacity-50`}
            >
              <ChevronRight size={15} aria-hidden />
            </button>
          </li>
        </ul>
      )}
    </nav>
  );
}
