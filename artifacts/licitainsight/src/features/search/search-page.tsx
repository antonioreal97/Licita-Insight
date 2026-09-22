import { useState } from 'react';
import { Bookmark, ChevronLeft, ChevronRight, Filter, LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react';
import type { SortOption, TenderStatus } from '@/api';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { TenderRow } from '@/features/tenders/components/tender-row';
import { formatNumber } from '@/lib/format';
import { sortLabels } from '@/lib/tender-labels';
import { countActiveFilters } from '@/services/search-service';
import { EmptySearch } from './components/empty-search';
import { FacetSelect } from './components/facet-select';
import { ResultsTable } from './components/results-table';
import { SearchBar } from './components/search-bar';
import { useSearchUrlState } from './hooks/use-search-url-state';
import { useTenderSearch } from './hooks/use-tender-search';

export default function SearchPage() {
  const { params, update, clearFilters } = useSearchUrlState();
  const search = useTenderSearch(params);
  const { isSaved, toggle } = useSavedTenders();
  const [view, setView] = useState<'list' | 'table'>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const response = search.data;
  const facets = response?.facets;
  const pagination = response?.pagination;
  const page = params.page ?? 1;
  const activeFilters = countActiveFilters(params);

  const filterControls = (className: string) => (
    <>
      <FacetSelect
        label="Filtrar por estado"
        allLabel="Todos os estados"
        testId="select-state"
        buckets={facets?.state ?? []}
        selected={params.state ?? []}
        onChange={(state) => update({ state })}
        className={className}
      />
      <FacetSelect
        label="Filtrar por status"
        allLabel="Todos os status"
        testId="select-status"
        buckets={facets?.status ?? []}
        selected={params.status ?? []}
        onChange={(status) => update({ status: status as TenderStatus[] })}
        className={className}
      />
    </>
  );

  return (
    <>
      <PageTitle
        eyebrow="central de pesquisa"
        title="Explorar editais"
        description="Pesquise por oportunidade, órgão, categoria ou localização. Dados demonstrativos para navegação."
        action={
          // TODO(saved-searches): wire once the saved-searches API exists.
          <Button variant="outline" data-testid="button-save-search">
            <Bookmark size={14} />
            Salvar busca
          </Button>
        }
      />

      <div className="mb-5 rounded-xl border border-border bg-card p-3 sm:p-4">
        <SearchBar value={params.q ?? ''} onSubmit={(q) => update({ q })} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            data-testid="button-filter-drawer"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted sm:hidden"
          >
            <SlidersHorizontal size={14} />
            Filtros{activeFilters > 0 && ` (${activeFilters})`}
          </button>
          {filterControls('hidden sm:block')}
          {params.q && (
            <button
              data-testid="button-clear-search"
              aria-label={`Remover termo ${params.q}`}
              onClick={() => update({ q: undefined })}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1.5 text-xs text-secondary-foreground"
            >
              “{params.q}” <X size={12} />
            </button>
          )}
          <span aria-live="polite" className="ml-auto text-xs text-muted-foreground">
            {pagination ? `${formatNumber(pagination.total)} ${pagination.total === 1 ? 'resultado' : 'resultados'}` : ' '}
          </span>
        </div>
        {filtersOpen && <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:hidden">{filterControls('h-10 text-sm')}</div>}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter size={14} />
          Ordenar por
          <select
            data-testid="select-sort"
            value={params.sort ?? 'relevance'}
            onChange={(e) => update({ sort: e.target.value as SortOption })}
            className="bg-transparent font-semibold text-foreground outline-none"
          >
            {(Object.keys(sortLabels) as SortOption[]).map((sort) => (
              <option key={sort} value={sort}>
                {sortLabels[sort]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex rounded-lg border border-border bg-card p-0.5">
          <button
            aria-label="Visualização em lista"
            aria-pressed={view === 'list'}
            data-testid="button-view-list"
            onClick={() => setView('list')}
            className={`rounded-md p-1.5 ${view === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
          >
            <List size={15} />
          </button>
          <button
            aria-label="Visualização em tabela"
            aria-pressed={view === 'table'}
            data-testid="button-view-table"
            onClick={() => setView('table')}
            className={`rounded-md p-1.5 ${view === 'table' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      <div className={search.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {search.isPending ? (
          <RowsSkeleton rows={5} />
        ) : search.isError ? (
          <ErrorState error={search.error} onRetry={() => search.refetch()} />
        ) : response!.data.length === 0 ? (
          <EmptySearch
            query={params.q}
            hasFilters={activeFilters > 0 || Boolean(params.q)}
            onClear={() => (activeFilters > 0 ? clearFilters() : update({ q: undefined }))}
          />
        ) : view === 'list' ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {response!.data.map((tender) => (
              <TenderRow key={tender.id} tender={tender} saved={isSaved(tender.id)} onSave={() => toggle(tender.id)} />
            ))}
          </div>
        ) : (
          <ResultsTable tenders={response!.data} isSaved={isSaved} onToggleSave={toggle} />
        )}
      </div>

      {pagination && pagination.total > 0 && (
        <nav aria-label="Paginação" className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Mostrando {formatNumber((page - 1) * pagination.pageSize + 1)}–{formatNumber(Math.min(page * pagination.pageSize, pagination.total))} de{' '}
            {formatNumber(pagination.total)} oportunidades
          </span>
          <div className="flex gap-1">
            <button
              aria-label="Página anterior"
              data-testid="button-previous-page"
              disabled={page <= 1}
              onClick={() => update({ page: page - 1 })}
              className="rounded-md border border-border p-2 hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <span aria-current="page" className="grid min-w-8 place-items-center rounded-md bg-secondary font-mono text-[11px] text-foreground">
              {page}
            </span>
            <button
              aria-label="Próxima página"
              data-testid="button-next-page"
              disabled={page >= pagination.totalPages}
              onClick={() => update({ page: page + 1 })}
              className="rounded-md border border-border p-2 hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </nav>
      )}
    </>
  );
}
