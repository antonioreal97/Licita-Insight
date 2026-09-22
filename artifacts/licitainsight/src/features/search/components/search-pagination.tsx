import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination } from '@/api';
import { formatNumber } from '@/lib/format';
import { pageItems } from '../lib/pagination';

type Props = { pagination: Pagination; page: number; onPageChange: (page: number) => void; pageSizeControl?: ReactNode };

const base =
  'grid h-10 min-w-10 place-items-center rounded-lg border px-2 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-9 sm:min-w-9';

export function SearchPagination({ pagination, page, onPageChange, pageSizeControl }: Props) {
  const { total, pageSize, totalPages, totalIsEstimate } = pagination;
  if (total === 0) return null;
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
          {formatNumber(total)} {total === 1 ? 'oportunidade' : 'oportunidades'}
        </span>
      </div>
      {totalPages > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            <button
              type="button"
              aria-label="Página anterior"
              data-testid="button-previous-page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className={`${base} border-border bg-card text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40`}
            >
              <ChevronLeft size={15} />
            </button>
          </li>
          {/* Compact "3 / 12" on phones; numbered pages with ellipses from sm up. */}
          <li className="px-2 font-mono text-xs text-foreground sm:hidden" aria-current="page">
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
                  className={`${base} ${item === page ? 'border-primary bg-primary font-bold text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'}`}
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
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className={`${base} border-border bg-card text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40`}
            >
              <ChevronRight size={15} />
            </button>
          </li>
        </ul>
      )}
    </nav>
  );
}
