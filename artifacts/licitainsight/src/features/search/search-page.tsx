import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { List, Loader2, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Table2 } from 'lucide-react';
import { Link } from 'wouter';
import { isApiError, type SearchSuggestion, type SortOption, type TenderSearchParams } from '@/api';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { TenderRow } from '@/features/tenders/components/tender-row';
import { useCompanyProfile, useTenderFits } from '@/features/company-profile/hooks/use-company-profile';
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
import { savedQueryHref, searchDefaultsToUrl } from './lib/search-defaults';
import { relevanceVaries } from '@/features/tenders/lib/tender-display';
import { useRecommendationPreferences } from '@/features/recommendations/hooks/use-recommendations';
import { accountService } from '@/services/account-service';
import { trackSearch } from '@/features/analytics/google-analytics';

const SORTS = Object.keys(sortLabels) as SortOption[];
const PAGE_SIZES = [10, 20, 50];

export default function SearchPage() {
  const { params, view, setView, update, replaceAll, clearFilters } = useSearchUrlState();
  const search = useTenderSearch(params);
  const { isSaved, toggle } = useSavedTenders();
  const recent = useRecentSearches();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [desktopFiltersCollapsed, setDesktopFiltersCollapsed] = useState(false);
  const resultsRef = useRef<HTMLElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const lastRecordedSearch = useRef<string | null>(null);
  const recommendationPreferences = useRecommendationPreferences();
  const companyProfile = useCompanyProfile();
  const desktopFiltersRef = useRef<HTMLDivElement>(null);

  const response = search.data;
  const fits = useTenderFits(response?.data.map((tender) => tender.id) ?? []);
  const facets = response?.facets;
  const scoresVary = response ? relevanceVaries(response.data) : false;
  const pagination = response?.pagination;
  const notificationContext = response?.meta.notification;
  const completeSearchHref = notificationContext?.savedSearchQuery != null
    ? savedQueryHref(notificationContext.savedSearchQuery, { withoutNewOnly: true })
    : null;
  const page = params.page ?? 1;
  // A shared link can point past the last page (the total shrank): jump to the last page instead of an empty page.
  // Judged on the response's own page so the skeleton stays up while the corrected page loads (no empty-state flash).
  const pageOutOfRange = Boolean(pagination && pagination.total > 0 && pagination.page > pagination.totalPages);
  // Counted on the URL form: the default status is not a user choice, "Todos os status" is (clearing returns to the default).
  const activeFilters = countActiveFilters(searchDefaultsToUrl(params));
  const unavailable = search.isError && isApiError(search.error) && search.error.code === 'SEARCH_UNAVAILABLE';
  const refreshing = search.isFetching && !search.isPending;

  // Keep human labels for chips even when a value drops out of the current buckets.
  useMemo(() => rememberFacetLabels(facets), [facets]);
  const relaxation = useRelaxation(params, facets, response?.data.length === 0 && !pageOutOfRange && !search.isPlaceholderData, countActiveFilters(params) > 0);
  // Without a query the backend orders by publication date even when sort is "relevance" (contract §1): show that.
  const effectiveSort: SortOption = params.sort ?? (params.q ? 'relevance' : 'published_desc');

  useEffect(() => {
    if (pageOutOfRange && pagination && page > pagination.totalPages) update({ page: pagination.totalPages }, { replace: true });
  }, [pageOutOfRange, pagination, page, update]);

  useEffect(() => {
    const query = params.q?.trim();
    if (!query || page !== 1 || !search.isSuccess || !recommendationPreferences.data?.personalizationEnabled || lastRecordedSearch.current === query) return;
    lastRecordedSearch.current = query;
    void accountService.recordRecommendationSearch(query).catch(() => undefined);
  }, [page, params.q, recommendationPreferences.data?.personalizationEnabled, search.isSuccess]);

  useLayoutEffect(() => {
    let frame = 0;

    const fitFiltersToViewport = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Let sticky positioning settle for one paint before measuring its final viewport offset.
        frame = requestAnimationFrame(() => {
          const panel = desktopFiltersRef.current;
          if (!panel) return;

          // While the rail is below its sticky position, its real top edge determines how much of the
          // viewport is available. Once stuck, getBoundingClientRect() already reports the sticky top.
          const availableHeight = Math.max(240, window.innerHeight - panel.getBoundingClientRect().top - 16);
          if (desktopFiltersCollapsed) {
            panel.style.height = `${availableHeight}px`;
            panel.style.maxHeight = '';
          } else {
            panel.style.height = '';
            panel.style.maxHeight = `${availableHeight}px`;
          }
        });
      });
    };

    fitFiltersToViewport();
    window.addEventListener('scroll', fitFiltersToViewport, { passive: true });
    window.addEventListener('resize', fitFiltersToViewport);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', fitFiltersToViewport);
      window.removeEventListener('resize', fitFiltersToViewport);
    };
  }, [desktopFiltersCollapsed, params.q, response?.meta.searchMode, response?.meta.searchModeFallbackReason]);

  const submitQuery = (q: string) => {
    if (q) {
      recent.add(q);
      trackSearch();
    }
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
        {companyProfile.data?.profile && (
          <button
            type="button"
            aria-pressed={params.myRegion === true}
            onClick={() => update({ myRegion: params.myRegion ? undefined : true })}
            className={`rounded-pill border px-3 py-1.5 type-meta font-semibold transition-colors duration-fast focus-visible:focus-ring ${
              params.myRegion
                ? 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground'
                : 'border-border bg-surface text-foreground hover:border-border-strong'
            }`}
            data-testid="button-my-region"
          >
            Minha região
          </button>
        )}
      </div>

      {/* Container query: the facet sidebar appears when the content column (not the viewport) is wide enough. */}
      <div className="@container/page">
        <div
          className={`grid gap-6 transition-[grid-template-columns] duration-slow ease-emphasized ${
            desktopFiltersCollapsed ? '@min-[52rem]/page:grid-cols-[40px_minmax(0,1fr)]' : '@min-[52rem]/page:grid-cols-[264px_minmax(0,1fr)]'
          }`}
        >
          <aside
            aria-label={desktopFiltersCollapsed ? 'Filtros' : undefined}
            aria-labelledby={desktopFiltersCollapsed ? undefined : 'facets-title'}
            className="hidden @min-[52rem]/page:block"
          >
            {/* A flat rail, not a card. Offsets follow the header token. */}
            <div
              ref={desktopFiltersRef}
              className={`sticky top-[calc(var(--spacing-header-mobile)+1rem)] border-r border-border-subtle pb-2 lg:top-[calc(var(--spacing-header)+1rem)] ${
                desktopFiltersCollapsed
                  ? 'pr-1'
                  : 'overflow-y-auto overscroll-contain pr-4 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]'
              }`}
            >
              <div
                className={`sticky top-0 z-raised flex items-center border-b border-border-subtle bg-background pb-3 ${
                  desktopFiltersCollapsed ? 'justify-center' : 'justify-between'
                }`}
              >
                {!desktopFiltersCollapsed && (
                  <h2 id="facets-title" className="type-section">
                    Filtros
                  </h2>
                )}
                <div className="flex items-center gap-1">
                  {!desktopFiltersCollapsed && activeFilters > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      data-testid="button-sidebar-clear"
                      className="rounded-lg px-1.5 py-1 text-xs font-semibold text-primary hover:underline focus-visible:focus-ring"
                    >
                      Limpar ({activeFilters})
                    </button>
                  )}
                  <button
                    type="button"
                    aria-controls="desktop-facets"
                    aria-expanded={!desktopFiltersCollapsed}
                    aria-label={desktopFiltersCollapsed ? 'Expandir filtros' : 'Recolher filtros'}
                    title={desktopFiltersCollapsed ? 'Expandir filtros' : 'Recolher filtros'}
                    data-testid="button-collapse-filters"
                    onClick={() => setDesktopFiltersCollapsed((collapsed) => !collapsed)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:focus-ring"
                  >
                    {desktopFiltersCollapsed ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
                  </button>
                </div>
              </div>
              <div id="desktop-facets" hidden={desktopFiltersCollapsed}>
                <FacetPanel params={params} facets={facets} onChange={update} loading={search.isPending} />
              </div>
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
                  <span className="rounded-pill bg-primary px-1.5 py-0.5 type-data text-xs leading-none font-bold text-primary-foreground">
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
                      className={`grid h-8 w-8 place-items-center rounded-lg transition-[background-color,color,box-shadow] duration-fast ease-standard focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${view === value ? 'bg-surface text-foreground ' : 'text-muted-foreground enabled:hover:text-foreground'}`}
                    >
                      <Icon size={15} aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-3 empty:hidden">
              <ActiveFilters
                params={params}
                notification={notificationContext}
                onRemove={update}
                onClearAll={clearFilters}
                canClear={activeFilters > 0}
              />
            </div>

            {notificationContext && notificationContext.matchCount > notificationContext.storedTenderCount && (
              <p className="mb-3 type-meta text-muted-foreground" data-testid="notification-truncated-note">
                Mostrando os {formatNumber(notificationContext.storedTenderCount)} primeiros de {formatNumber(notificationContext.matchCount)}
                {completeSearchHref && (
                  <>
                    {' · '}
                    <Link href={completeSearchHref} className="font-semibold text-primary hover:underline focus-visible:focus-ring">
                      Ver a busca completa
                    </Link>
                  </>
                )}
              </p>
            )}

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
                  notification={Boolean(params.notification)}
                  completeSearchHref={completeSearchHref}
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
                      <TenderRow
                        key={tender.id}
                        tender={tender}
                        saved={isSaved(tender.id)}
                        onSave={() => toggle(tender.id)}
                        relevanceVaries={scoresVary}
                        fit={fits.data?.results[tender.id]}
                      />
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
