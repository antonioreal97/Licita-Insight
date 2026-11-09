import { FormEvent, useRef, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { ExternalLink, Loader2, SearchX } from 'lucide-react';
import { isApiError, type OpportunityScope, type OpportunitySummary } from '@/api';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { EmptyState } from '@/components/common/empty-state';
import { FilterSidebar, filterWorkspaceClass } from '@/components/filters/filter-sidebar';
import { SearchPagination } from '@/features/search/components/search-pagination';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { deniedAccess, useOpportunitySearch } from './hooks/use-opportunities';
import { useOpportunityUrlState } from './hooks/use-opportunity-url-state';
import { AccessPanel, OpportunityAccessGate } from './components/access-gate';
import { ActiveOpportunityFilters, OpportunityFilterSheet, OpportunityFiltersButton, opportunityAppliedMessage } from './components/opportunity-filter-sheet';
import { InternationalFilters, InternationalRow, OfficialNoticeBanner } from './components/international';
import { CLEAR_INTERNATIONAL_FILTERS } from './components/international';
import { UnProcurementGuide } from './components/un-procurement-guide';
import { CLEAR_NATIONAL_FILTERS, OpportunityFilters } from './components/opportunity-filters';
import { ApplicationBadge } from './components/application-panel';
import { NOTICE_DATE_NOTE, registrationDates } from './lib/application';
import {
  IndividualListingBadge,
  OpportunityStatusBadge,
  opportunityAreaLabels,
  opportunityKindLabels,
  opportunityProgramLabels,
} from './components/opportunity-status';
import { opportunityFilterChips } from './lib/opportunity-filters';

/** At most this many areas on a row; a call can list dozens. */
const AREAS_ON_ROW = 3;

const placeOf = (opportunity: OpportunitySummary): string =>
  opportunity.city && opportunity.state ? `${opportunity.city} (${opportunity.state})` : (opportunity.state ?? 'Nacional');

const registrationPeriod = (opportunity: OpportunitySummary): string => {
  const dates = registrationDates(opportunity);
  const note = dates.fromNotice ? ` (${NOTICE_DATE_NOTE})` : '';
  return opportunity.continuousFlow && !dates.to
    ? `Inscrições desde ${formatDate(dates.from)} · fluxo contínuo${note}`
    : `Inscrições ${formatDate(dates.from)} – ${formatDate(dates.to)}${note}`;
};

function OpportunityRow({ opportunity }: { opportunity: OpportunitySummary }) {
  const place = placeOf(opportunity);
  const areas = opportunity.areas.filter((area) => area !== 'outras');
  const hiddenAreas = areas.length - AREAS_ON_ROW;
  return (
    <li className="border-b border-border-subtle last:border-0">
      <div className="grid gap-3 px-4 py-4 transition-colors duration-fast ease-standard hover:bg-muted/60 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <OpportunityStatusBadge status={opportunity.status} />
          <span className="rounded-pill bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">{opportunity.sourceName}</span>
          <span className="type-label text-muted-foreground">{opportunity.opportunityType ?? opportunityKindLabels[opportunity.kind]}</span>
          {opportunity.program && opportunity.program !== 'audiovisual' && (
            <span className="type-label text-muted-foreground">{opportunityProgramLabels[opportunity.program]}</span>
          )}
          <span className="type-label text-muted-foreground">{place}</span>
          {opportunity.profileMatch && <span className="type-label font-semibold text-primary">Combina com seu perfil</span>}
          {opportunity.individualListing && <IndividualListingBadge />}
          <ApplicationBadge application={opportunity.application} />
        </div>
        {areas.length > 0 && (
          <ul aria-label="Áreas culturais" className="flex flex-wrap gap-1.5">
            {areas.slice(0, AREAS_ON_ROW).map((area) => (
              <li key={area} className="rounded-pill border border-border-subtle bg-surface-sunken px-2 py-0.5 type-meta">
                {opportunityAreaLabels[area]}
              </li>
            ))}
            {hiddenAreas > 0 && <li className="px-1 py-0.5 type-meta text-muted-foreground">+{hiddenAreas}</li>}
          </ul>
        )}
        <Link href={`/oportunidades/${encodeURIComponent(opportunity.id)}`} data-testid={`opportunity-${opportunity.id}`}>
          <h2 className="type-section text-foreground hover:text-primary">{opportunity.title}</h2>
          <p className="mt-2 type-meta text-muted-foreground">{opportunity.organizationName}</p>
          {opportunity.summary && <p className="mt-2 line-clamp-2 type-body text-muted-foreground">{opportunity.summary}</p>}
        </Link>
        <p className="type-meta text-muted-foreground">{registrationPeriod(opportunity)}</p>
        {opportunity.sourceUrl && (
          <a
            href={opportunity.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 type-meta font-semibold text-primary hover:underline"
          >
            Ver fonte oficial <ExternalLink size={13} aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}

export default function OpportunitiesPage() {
  // Same names as the sidebar entries that open this page.
  const international = new URLSearchParams(useSearch()).get('scope') === 'international';
  return (
    <>
      <PageTitle
        title={international ? 'Editais internacionais' : 'Editais nacionais'}
        description={
          international
            ? 'Chamadas e licitações de organismos internacionais, como Banco Mundial e BID, abertas a participantes do Brasil. Confira sempre a elegibilidade na fonte oficial.'
            : 'Chamadas de cultura, fomento e inovação de fontes oficiais do Brasil. Licitações do PNCP continuam em Explorar editais.'
        }
      />
      <OpportunityAccessGate>
        <OpportunitySearch />
      </OpportunityAccessGate>
    </>
  );
}

function OpportunitySearch() {
  const { params, update, replaceAll } = useOpportunityUrlState();
  const search = useOpportunitySearch(params);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [desktopFiltersCollapsed, setDesktopFiltersCollapsed] = useState(false);
  const [appliedAnnouncement, setAppliedAnnouncement] = useState('');
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const response = search.data;
  const pagination = response?.pagination;
  const unavailable = search.isError && isApiError(search.error) && search.error.code === 'SEARCH_UNAVAILABLE';
  const denied = deniedAccess(search.error);
  if (denied) return <AccessPanel reason={denied} />;

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const q = String(data.get('q') ?? '').trim();
    update({ q: q || undefined });
  };

  const facets = response?.facets ?? null;
  const scope: OpportunityScope = params.scope ?? 'national';
  const international = scope === 'international';
  const activeFilters = opportunityFilterChips(params, new Date(), facets).length;
  const clearFilters = () => update(international ? CLEAR_INTERNATIONAL_FILTERS : CLEAR_NATIONAL_FILTERS);
  const resultCount = search.isPending
    ? 'Buscando oportunidades…'
    : search.isError
      ? 'Resultados indisponíveis'
      : pagination
        ? `${formatNumber(pagination.total)} ${pagination.total === 1 ? 'oportunidade' : 'oportunidades'}`
        : '';
  const refreshing = search.isFetching && !search.isPending;

  return (
    <>
      {international && <OfficialNoticeBanner className="mb-4" />}
      {international && <UnProcurementGuide className="mb-4" />}
      <form onSubmit={onSearch} className="mb-5 sm:mb-6">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Buscar chamadas</span>
          <input
            key={params.q ?? ''}
            name="q"
            defaultValue={params.q ?? ''}
            data-testid="input-opportunity-query"
            placeholder="Título, órgão ou resumo"
            className="h-10 w-full rounded-lg border border-input bg-card px-3 type-ui text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>
      </form>

      <div className="@container/page">
        <div className={filterWorkspaceClass(desktopFiltersCollapsed)}>
          <FilterSidebar
            collapsed={desktopFiltersCollapsed}
            onCollapsedChange={setDesktopFiltersCollapsed}
            activeCount={activeFilters}
            onClear={clearFilters}
            panelId="desktop-opportunity-filters"
            titleId="opportunity-filters-title"
            testIdPrefix="opportunity-"
            layoutKey={scope}
          >
            {international ? (
              <InternationalFilters params={params} facets={facets} onChange={update} />
            ) : (
              <OpportunityFilters params={params} facets={facets} hiddenIndividualListings={response?.meta.hiddenIndividualListings ?? 0} onChange={update} />
            )}
          </FilterSidebar>

          <section ref={resultsRef} aria-labelledby="opportunity-results-title" className="min-w-0 scroll-mt-24">
            <h2 id="opportunity-results-title" className="sr-only">
              Oportunidades
            </h2>
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <OpportunityFiltersButton params={params} facets={facets} open={sheetOpen} onOpen={() => setSheetOpen(true)} triggerRef={filtersButtonRef} />
              <p aria-live="polite" aria-atomic="true" data-testid="text-opportunity-result-count" className="min-w-0 text-sm text-muted-foreground">
                <span className={search.isError ? 'font-medium' : 'font-semibold text-foreground'}>{resultCount}</span>
                {params.q && pagination && !search.isPending && !search.isError && <span className="hidden sm:inline"> para “{params.q}”</span>}
                {appliedAnnouncement && <span className="sr-only"> {appliedAnnouncement}</span>}
              </p>
              {refreshing && (
                <span role="status" className="inline-flex items-center gap-1 type-meta text-muted-foreground" data-testid="status-opportunity-refreshing">
                  <Loader2 size={13} className="animate-spin" aria-hidden />
                  Atualizando…
                </span>
              )}
              {!search.isPending && !search.isError && (
                <span className="type-meta text-muted-foreground">
                  {response?.meta.indexUpdatedAt ? `Atualizado em ${formatDateTime(response.meta.indexUpdatedAt)}` : 'Nenhuma coleta registrada'}
                </span>
              )}
            </div>

            <div className="mb-3 empty:hidden">
              <ActiveOpportunityFilters params={params} facets={facets} onChange={update} />
            </div>

            {international && response && !response.meta.internationalInProfile && (
              <p data-testid="notice-international-profile" className="mb-4 type-meta text-muted-foreground">
                Oportunidades internacionais não entram nas suas recomendações nem na combinação com o perfil.{' '}
                <Link href="/settings#recomendacoes" className="font-semibold text-primary hover:underline">
                  Ativar em Configurações
                </Link>
                .
              </p>
            )}

            {response && response.meta.installationIssues.length > 0 && (
              <details
                data-testid="banner-installation-issues"
                className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 type-ui text-foreground"
              >
                <summary className="cursor-pointer font-semibold">
                  {response.meta.installationIssues.length === 1
                    ? '1 fonte não respondeu por completo.'
                    : `${formatNumber(response.meta.installationIssues.length)} fontes não responderam por completo.`}
                </summary>
                <ul className="mt-2 space-y-1">
                  {response.meta.installationIssues.map((issue) => (
                    <li key={issue.installationId}>
                      {issue.name}: {issue.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {response && response.meta.gaps.length > 0 && (
              <p data-testid="banner-gaps" className="mb-4 type-meta text-muted-foreground">
                {response.meta.gaps.length} estados não têm instalação estadual do Mapas Culturais: {response.meta.gaps.map((gap) => gap.uf).join(', ')}. Neles
                só entram chamadas de municípios com instalação própria.
              </p>
            )}

            {search.isPending ? (
              <RowsSkeleton />
            ) : search.isError ? (
              unavailable ? (
                <div data-testid="state-error" className="rounded-xl border border-dashed border-border-strong px-5 py-14 text-center">
                  <h2 className="type-section">Chamadas temporariamente indisponíveis</h2>
                  <p className="mx-auto mt-2 max-w-md type-body text-muted-foreground">
                    O banco de editais nacionais não respondeu. Tente de novo em instantes.
                  </p>
                </div>
              ) : (
                <ErrorState error={search.error} onRetry={() => search.refetch()} />
              )
            ) : response && response.data.length === 0 ? (
              <EmptyState icon={SearchX} title="Nenhuma chamada encontrada" testId="state-empty">
                {international
                  ? 'Não há oportunidades internacionais com esses filtros. Experimente “Qualquer elegibilidade”; a coleta internacional também pode estar desligada.'
                  : 'Não há oportunidades com esses filtros. A coleta ainda pode não ter rodado.'}
              </EmptyState>
            ) : (
              <section aria-label="Oportunidades" data-testid="list-opportunities">
                <ul className="overflow-hidden rounded-xl border border-border bg-card">
                  {response?.data.map((opportunity) =>
                    opportunity.international ? (
                      <InternationalRow key={opportunity.id} opportunity={opportunity} />
                    ) : (
                      <OpportunityRow key={opportunity.id} opportunity={opportunity} />
                    ),
                  )}
                </ul>
                {pagination && (
                  <SearchPagination
                    pagination={pagination}
                    page={params.page ?? 1}
                    onPageChange={(page) => {
                      update({ page });
                      resultsRef.current?.scrollIntoView({
                        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                        block: 'start',
                      });
                    }}
                  />
                )}
              </section>
            )}
          </section>
        </div>
      </div>

      <OpportunityFilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        params={params}
        facets={facets}
        triggerRef={filtersButtonRef}
        onApply={(next, total) => {
          replaceAll(next);
          setAppliedAnnouncement(opportunityAppliedMessage(total));
        }}
      />
    </>
  );
}
