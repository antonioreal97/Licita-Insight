import { useMemo, useRef, useState } from 'react';
import { LayoutGrid, List, Loader2, SlidersHorizontal } from 'lucide-react';
import { isApiError, type SearchSuggestion, type SortOption, type TenderSearchParams } from '@/api';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { TenderRow } from '@/features/tenders/components/tender-row';
import { formatDateTime, formatNumber } from '@/lib/format';
import { sortLabels } from '@/lib/tender-labels';
import { countActiveFilters, DEFAULT_PAGE_SIZE } from '@/services/search-service';
import { ActiveFilters } from './components/active-filters';
import { EmptySearch } from './components/empty-search';
import { FacetPanel } from './components/facet-panel';
import { FiltersSheet } from './components/filters-sheet';
import { ResultsTable } from './components/results-table';
import { SaveSearchButton } from './components/save-search-button';
import { SearchCombobox } from './components/search-combobox';
import { SearchModeControl } from './components/search-mode-control';
import { SearchPagination } from './components/search-pagination';
import { SearchUnavailable } from './components/search-unavailable';
import { useRecentSearches } from './hooks/use-recent-searches';
import { useSearchUrlState } from './hooks/use-search-url-state';
import { useTenderSearch } from './hooks/use-tender-search';
import { rememberFacetLabels, rememberLabel } from './lib/facet-config';
import { suggestRelaxation } from './lib/relaxation';

const SORTS = Object.keys(sortLabels) as SortOption[];
const PAGE_SIZES = [10, 20, 50];

export default function SearchPage() {
  const { params, update, replaceAll, clearFilters } = useSearchUrlState();
  const search = useTenderSearch(params);
  const { isSaved, toggle } = useSavedTenders();
  const recent = useRecentSearches();
  const [view, setView] = useState<'list' | 'table'>('list');
  const [sheetOpen, setSheetOpen] = useState(false);
  const resultsRef = useRef<HTMLElement>(null);

  const response = search.data;
  const facets = response?.facets;
  const pagination = response?.pagination;
  const page = params.page ?? 1;
  const activeFilters = countActiveFilters(params);
  const unavailable = search.isError && isApiError(search.error) && search.error.code === 'SEARCH_UNAVAILABLE';
  const refreshing = search.isFetching && !search.isPending;

  // Keep human labels for chips even when a value drops out of the current buckets.
  useMemo(() => rememberFacetLabels(facets), [facets]);
  const relaxation = useMemo(() => (response?.data.length === 0 ? suggestRelaxation(params, facets) : null), [response, params, facets]);

  const submitQuery = (q: string) => {
    if (q) recent.add(q);
    update({ q: q || undefined });
  };

  const selectFilter = (suggestion: SearchSuggestion) => {
    const key = suggestion.type === 'organization' ? 'organizationId' : 'category';
    rememberLabel(key, suggestion.value, suggestion.label);
    const current = params[key] ?? [];
    update({ [key]: current.includes(suggestion.value) ? current : [...current, suggestion.value] });
  };

  const goToPage = (next: number) => {
    update({ page: next });
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const resultCount = search.isPending
    ? 'Buscando oportunidades…'
    : pagination
      ? `${pagination.totalIsEstimate ? 'Aprox. ' : ''}${formatNumber(pagination.total)} ${pagination.total === 1 ? 'resultado' : 'resultados'}`
      : '';

  return (
    <>
      <PageTitle
        eyebrow="central de pesquisa"
        title="Explorar editais"
        description="Pesquise por objeto, órgão ou localização nas publicações coletadas do PNCP."
        action={<SaveSearchButton />}
      />

      <div className="mb-5 space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
        <SearchCombobox value={params.q ?? ''} onSubmitQuery={submitQuery} onSelectFilter={selectFilter} />
        <SearchModeControl
          mode={params.mode}
          appliedMode={search.isPlaceholderData ? undefined : response?.meta.searchMode}
          onChange={(mode) => update({ mode })}
        />
      </div>

      {/* Container query: the facet sidebar appears when the content column (not the viewport) is wide enough. */}
      <div className="@container/page">
        <div className="grid gap-6 @min-[52rem]/page:grid-cols-[264px_minmax(0,1fr)]">
          <aside aria-labelledby="facets-title" className="hidden @min-[52rem]/page:block">
            <div className="sticky top-[92px] max-h-[calc(100dvh-108px)] overflow-y-auto rounded-xl border border-border bg-card px-4 pb-2">
              <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between border-b border-border bg-card px-4 py-3">
                <h2 id="facets-title" className="text-sm font-semibold">
                  Filtros
                </h2>
                {activeFilters > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    data-testid="button-sidebar-clear"
                    className="rounded px-1.5 py-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    Limpar ({activeFilters})
                  </button>
                )}
              </div>
              <FacetPanel params={params} facets={facets} onChange={update} loading={search.isPending} />
            </div>
          </aside>

          <section ref={resultsRef} aria-label="Resultados da busca" className="@container/results min-w-0 scroll-mt-24">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                data-testid="button-filter-drawer"
                onClick={() => setSheetOpen(true)}
                className="h-10 @min-[52rem]/page:hidden"
              >
                <SlidersHorizontal size={14} aria-hidden />
                Filtros
                {activeFilters > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-primary-foreground">
                    {activeFilters}
                  </span>
                )}
              </Button>
              <p aria-live="polite" aria-atomic="true" data-testid="text-result-count" className="min-w-0 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{resultCount}</span>
                {params.q && pagination && !search.isPending && <span className="hidden sm:inline"> para “{params.q}”</span>}
              </p>
              {refreshing && (
                <span role="status" className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="status-refreshing">
                  <Loader2 size={13} className="animate-spin" aria-hidden />
                  Atualizando…
                </span>
              )}
              {!search.isPending && (
                <span data-testid="text-index-updated" className="text-xs text-muted-foreground">
                  {response?.meta.indexUpdatedAt
                    ? `Atualizado em ${formatDateTime(response.meta.indexUpdatedAt)}`
                    : 'Nenhuma coleta do PNCP registrada'}
                </span>
              )}

              <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="hidden text-xs text-muted-foreground sm:inline">
                    Ordenar por
                  </span>
                  <Select value={params.sort ?? 'relevance'} onValueChange={(sort) => update({ sort: sort as SortOption })}>
                    <SelectTrigger aria-label="Ordenar por" data-testid="select-sort" className="h-10 w-[172px] bg-card text-xs sm:h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORTS.map((sort) => (
                        <SelectItem key={sort} value={sort} className="text-xs">
                          {sortLabels[sort]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div role="group" aria-label="Modo de visualização" className="hidden rounded-lg border border-border bg-card p-0.5 md:flex">
                  <button
                    type="button"
                    aria-label="Visualização em lista"
                    aria-pressed={view === 'list'}
                    data-testid="button-view-list"
                    onClick={() => setView('list')}
                    className={`grid h-8 w-8 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${view === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <List size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="Visualização em tabela"
                    aria-pressed={view === 'table'}
                    data-testid="button-view-table"
                    onClick={() => setView('table')}
                    className={`grid h-8 w-8 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${view === 'table' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <LayoutGrid size={15} />
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-3 empty:hidden">
              <ActiveFilters params={params} onRemove={update} onClearAll={clearFilters} />
            </div>

            <div
              aria-busy={search.isFetching}
              className={`transition-opacity duration-200 ${search.isPlaceholderData ? 'pointer-events-none opacity-60' : ''}`}
              data-testid="search-results"
            >
              {search.isPending ? (
                <RowsSkeleton rows={6} />
              ) : unavailable ? (
                <SearchUnavailable
                  onRetry={() => search.refetch()}
                  retrying={search.isFetching}
                  requestId={isApiError(search.error) ? search.error.requestId : undefined}
                />
              ) : search.isError ? (
                <ErrorState error={search.error} onRetry={() => search.refetch()} />
              ) : response!.data.length === 0 ? (
                <EmptySearch
                  query={params.q}
                  hasFilters={activeFilters > 0}
                  relaxation={relaxation}
                  onRelax={() => relaxation && update(relaxation.patch)}
                  onClearFilters={clearFilters}
                  onClearQuery={() => update({ q: undefined })}
                />
              ) : (
                <>
                  {/* Table view is a desktop affordance; phones always get the list. */}
                  <div className={`overflow-hidden rounded-xl border border-border bg-card ${view === 'table' ? 'md:hidden' : ''}`}>
                    {response!.data.map((tender) => (
                      <TenderRow key={tender.id} tender={tender} saved={isSaved(tender.id)} onSave={() => toggle(tender.id)} />
                    ))}
                  </div>
                  {view === 'table' && (
                    <div className="hidden md:block">
                      <ResultsTable tenders={response!.data} isSaved={isSaved} onToggleSave={toggle} />
                    </div>
                  )}
                </>
              )}
            </div>

            {pagination && !search.isError && (
              <SearchPagination
                pagination={pagination}
                page={page}
                onPageChange={goToPage}
                pageSizeControl={
                  <Select value={String(params.pageSize ?? DEFAULT_PAGE_SIZE)} onValueChange={(size) => update({ pageSize: Number(size) })}>
                    <SelectTrigger aria-label="Resultados por página" data-testid="select-page-size" className="h-10 w-[104px] bg-card text-xs sm:h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[...new Set([...PAGE_SIZES, params.pageSize ?? DEFAULT_PAGE_SIZE])]
                        .sort((a, b) => a - b)
                        .map((size) => (
                          <SelectItem key={size} value={String(size)} className="text-xs">
                            {size} / pág.
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                }
              />
            )}
          </section>
        </div>
      </div>

      <FiltersSheet open={sheetOpen} onOpenChange={setSheetOpen} params={params} onApply={(next: TenderSearchParams) => replaceAll({ ...next, page: 1 })} />
    </>
  );
}
