import { useEffect, useMemo, useRef, useState } from 'react';
import { List, Loader2, SlidersHorizontal, Table2 } from 'lucide-react';
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
import { useRelaxation } from './hooks/use-relaxation';
import { useSearchUrlState } from './hooks/use-search-url-state';
import { useTenderSearch } from './hooks/use-tender-search';
import { rememberFacetLabels, rememberLabel } from './lib/facet-config';
import { relevanceVaries } from '@/features/tenders/lib/tender-display';

const SORTS = Object.keys(sortLabels) as SortOption[];
const PAGE_SIZES = [10, 20, 50];

export default function SearchPage() {
  const { params, view, setView, update, replaceAll, clearFilters } = useSearchUrlState();
  const search = useTenderSearch(params);
  const { isSaved, toggle } = useSavedTenders();
  const recent = useRecentSearches();
  const [sheetOpen, setSheetOpen] = useState(false);
  const resultsRef = useRef<HTMLElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);

  const response = search.data;
  const facets = response?.facets;
  const scoresVary = response ? relevanceVaries(response.data) : false;
  const pagination = response?.pagination;
  const page = params.page ?? 1;
  // A shared link can point past the last page (the total shrank): jump to the last page instead of an empty page.
  // Judged on the response's own page so the skeleton stays up while the corrected page loads (no empty-state flash).
  const pageOutOfRange = Boolean(pagination && pagination.total > 0 && pagination.page > pagination.totalPages);
  const activeFilters = countActiveFilters(params);
  const unavailable = search.isError && isApiError(search.error) && search.error.code === 'SEARCH_UNAVAILABLE';
  const refreshing = search.isFetching && !search.isPending;

  // Keep human labels for chips even when a value drops out of the current buckets.
  useMemo(() => rememberFacetLabels(facets), [facets]);
  const relaxation = useRelaxation(params, facets, response?.data.length === 0 && !pageOutOfRange && !search.isPlaceholderData, activeFilters > 0);
  // Without a query the backend orders by publication date even when sort is "relevance" (contract §1): show that.
  const effectiveSort: SortOption = params.sort ?? (params.q ? 'relevance' : 'published_desc');

  useEffect(() => {
    if (pageOutOfRange && pagination && page > pagination.totalPages) update({ page: pagination.totalPages }, { replace: true });
  }, [pageOutOfRange, pagination, page, update]);

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
    : search.isError
      ? 'Resultados indisponíveis'
      : pagination
        ? `${pagination.totalIsEstimate ? 'Aprox. ' : ''}${formatNumber(pagination.total)} ${pagination.total === 1 ? 'resultado' : 'resultados'}`
        : '';
  // Announced with the count (same live region) so paging is audible, not just the "Mostrando 8–14" line.
  const pageAnnouncement =
    pagination && pagination.totalPages > 1 && !search.isPending && !search.isError && !pageOutOfRange
      ? `Página ${formatNumber(Math.min(page, pagination.totalPages))} de ${formatNumber(pagination.totalPages)} · `
      : '';

  return (
    <>
      <PageTitle
        eyebrow="central de pesquisa"
        title="Explorar editais"
        description="Pesquise por objeto, órgão ou localização nas publicações coletadas do PNCP."
        action={<SaveSearchButton />}
      />

      {/* No card: the input carries its own border, so the search sits on the page (one data surface: the results). */}
      <div className="mb-5 space-y-3 sm:mb-6">
        <SearchCombobox value={params.q ?? ''} onSubmitQuery={submitQuery} onSelectFilter={selectFilter} />
        <SearchModeControl
          mode={params.mode}
          // No fallback note before there is a query to fall back from ("precisa de ao menos 3 caracteres" on an empty box).
          appliedMode={search.isPlaceholderData || !params.q ? undefined : response?.meta.searchMode}
          fallbackReason={search.isPlaceholderData || !params.q ? undefined : response?.meta.searchModeFallbackReason}
          onChange={(mode) => update({ mode })}
        />
      </div>

      {/* Container query: the facet sidebar appears when the content column (not the viewport) is wide enough. */}
      <div className="@container/page">
        <div className="grid gap-6 @min-[52rem]/page:grid-cols-[264px_minmax(0,1fr)]">
          <aside aria-labelledby="facets-title" className="hidden @min-[52rem]/page:block">
            {/* A flat rail, not a card. Offsets follow the header token. */}
            <div className="sticky top-[calc(3.5rem+1rem)] max-h-[calc(100dvh-3.5rem-2rem)] lg:top-[calc(var(--spacing-header)+1rem)] lg:max-h-[calc(100dvh-var(--spacing-header)-2rem)] overflow-y-auto overscroll-contain border-r border-border-subtle pr-4 pb-2 [scrollbar-color:hsl(var(--border-strong))_transparent] [scrollbar-width:thin]">
              <div className="sticky top-0 z-raised flex items-center justify-between border-b border-border-subtle bg-background pb-3">
                <h2 id="facets-title" className="type-section">
                  Filtros
                </h2>
                {activeFilters > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    data-testid="button-sidebar-clear"
                    className="rounded-sm px-1.5 py-1 text-xs font-semibold text-primary hover:underline focus-visible:focus-ring"
                  >
                    Limpar ({activeFilters})
                  </button>
                )}
              </div>
              <FacetPanel params={params} facets={facets} onChange={update} loading={search.isPending} />
            </div>
          </aside>

          <section ref={resultsRef} aria-labelledby="results-title" className="@container/results min-w-0 scroll-mt-24">
            <h2 id="results-title" className="sr-only">
              Resultados
            </h2>
            {/* Phones: Filtros · sort on one 40px row, the count wraps under it. */}
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <Button
                ref={filtersButtonRef}
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
                  <span className="rounded-full bg-primary px-1.5 py-0.5 type-data text-3xs leading-none font-bold text-primary-foreground">
                    {activeFilters}
                  </span>
                )}
              </Button>
              <div className="order-last flex min-w-0 basis-full flex-wrap items-center gap-x-2 gap-y-1 sm:order-none sm:basis-auto">
                <p aria-live="polite" aria-atomic="true" data-testid="text-result-count" className="min-w-0 text-sm text-muted-foreground">
                  {pageAnnouncement && <span className="sr-only">{pageAnnouncement}</span>}
                  <span className={search.isError ? 'font-medium' : 'font-semibold text-foreground'}>{resultCount}</span>
                  {params.q && pagination && !search.isPending && !search.isError && <span className="hidden sm:inline"> para “{params.q}”</span>}
                </p>
                {refreshing && (
                  <span role="status" className="inline-flex items-center gap-1 type-meta text-muted-foreground" data-testid="status-refreshing">
                    <Loader2 size={13} className="animate-spin" aria-hidden />
                    Atualizando…
                  </span>
                )}
                {!search.isPending && !search.isError && (
                  <span data-testid="text-index-updated" className="type-meta text-muted-foreground">
                    {response?.meta.indexUpdatedAt ? `Atualizado em ${formatDateTime(response.meta.indexUpdatedAt)}` : 'Nenhuma coleta do PNCP registrada'}
                  </span>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="hidden text-xs text-muted-foreground sm:inline">
                    Ordenar por
                  </span>
                  <Select value={effectiveSort} onValueChange={(sort) => update({ sort: sort as SortOption })} disabled={search.isError}>
                    <SelectTrigger
                      aria-label="Ordenar por"
                      data-testid="select-sort"
                      className="h-10 w-auto max-w-[9.5rem] min-w-0 bg-card text-xs sm:h-9 sm:w-[172px] sm:max-w-none"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORTS.map((sort) => (
                        <SelectItem key={sort} value={sort} disabled={sort === 'relevance' && !params.q} className="text-xs">
                          {sort === 'relevance' && !params.q ? 'Relevância (requer busca)' : sortLabels[sort]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div role="group" aria-label="Modo de visualização" className="hidden rounded-lg border border-border bg-muted/60 p-0.5 md:flex">
                  {(
                    [
                      { value: 'list', label: 'Visualização em lista', icon: List },
                      { value: 'table', label: 'Visualização em tabela', icon: Table2 },
                    ] as const
                  ).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={label}
                      aria-pressed={view === value}
                      disabled={search.isError}
                      data-testid={`button-view-${value}`}
                      onClick={() => setView(value)}
                      className={`grid h-8 w-8 place-items-center rounded-md transition-[background-color,color,box-shadow] duration-fast ease-standard focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${view === value ? 'bg-surface text-foreground shadow-2xs' : 'text-muted-foreground enabled:hover:text-foreground'}`}
                    >
                      <Icon size={15} aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-3 empty:hidden">
              <ActiveFilters params={params} onRemove={update} onClearAll={clearFilters} />
            </div>

            <div
              aria-busy={search.isFetching}
              // Dim stale results only after 120ms so fast refetches don't flicker; un-dim is immediate.
              className={`transition-opacity duration-base ease-standard ${search.isPlaceholderData ? 'pointer-events-none opacity-50 delay-120' : ''}`}
              data-testid="search-results"
            >
              {search.isPending || pageOutOfRange ? (
                <RowsSkeleton rows={6} />
              ) : unavailable ? (
                <SearchUnavailable
                  onRetry={() => search.refetch()}
                  retrying={search.isFetching}
                  requestId={isApiError(search.error) ? search.error.requestId : undefined}
                />
              ) : search.isError ? (
                <ErrorState error={search.error} onRetry={() => search.refetch()} onClearFilters={clearFilters} />
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
                      <TenderRow key={tender.id} tender={tender} saved={isSaved(tender.id)} onSave={() => toggle(tender.id)} relevanceVaries={scoresVary} />
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

            {pagination && !search.isError && !pageOutOfRange && (
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

      <FiltersSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        params={params}
        triggerRef={filtersButtonRef}
        onApply={(next: TenderSearchParams) => replaceAll({ ...next, page: 1 })}
      />
    </>
  );
}
