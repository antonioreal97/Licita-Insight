import { FormEvent } from 'react';
import { Link } from 'wouter';
import { ExternalLink, SearchX } from 'lucide-react';
import { isApiError, type OpportunityKind, type OpportunityScope, type OpportunitySource, type OpportunityStatus, type OpportunitySummary } from '@/api';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { EmptyState } from '@/components/common/empty-state';
import { SearchPagination } from '@/features/search/components/search-pagination';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { deniedAccess, useOpportunitySearch } from './hooks/use-opportunities';
import { useOpportunityUrlState } from './hooks/use-opportunity-url-state';
import { AccessPanel, OpportunityAccessGate } from './components/access-gate';
import { OpportunityFilters } from './components/opportunity-filters';
import { statePatch, stateOptions } from './lib/opportunity-filters';
import { InternationalFilters, InternationalRow, OfficialNoticeBanner } from './components/international';
import { ApplicationBadge } from './components/application-panel';
import { NOTICE_DATE_NOTE, registrationDates } from './lib/application';
import {
  INTERNATIONAL_KINDS,
  INTERNATIONAL_SOURCES,
  IndividualListingBadge,
  NATIONAL_KINDS,
  OpportunityStatusBadge,
  opportunityAreaLabels,
  opportunityKindLabels,
  opportunityProgramLabels,
  opportunitySourceLabels,
  opportunityStatusLabels,
} from './components/opportunity-status';

const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
];

const STATUSES = Object.keys(opportunityStatusLabels) as OpportunityStatus[];
const NATIONAL_SOURCES = (Object.keys(opportunitySourceLabels) as OpportunitySource[]).filter((source) => !INTERNATIONAL_SOURCES.includes(source));

const selectClass =
  'h-10 rounded-lg border border-input bg-card px-3 type-ui text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

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
  return (
    <>
      <PageTitle
        title="Hub de oportunidades"
        description="Chamadas de cultura, fomento e inovação de fontes oficiais, no Brasil e em organismos internacionais. Licitações do PNCP continuam em Explorar editais."
      />
      <OpportunityAccessGate>
        <OpportunitySearch />
      </OpportunityAccessGate>
    </>
  );
}

function OpportunitySearch() {
  const { params, update } = useOpportunityUrlState();
  const search = useOpportunitySearch(params);
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
  const setState = (value: string) => update(statePatch(value, facets, params));
  const setStatus = (value: string) => update({ status: value ? [value as OpportunityStatus] : undefined });
  const setKind = (value: string) => update({ kind: value ? [value as OpportunityKind] : undefined });
  const setSource = (value: string) => update({ source: value ? [value as OpportunitySource] : undefined });
  const scope: OpportunityScope = params.scope ?? 'national';
  const international = scope === 'international';
  const kinds = international ? INTERNATIONAL_KINDS : NATIONAL_KINDS;
  const sources = international ? INTERNATIONAL_SOURCES : NATIONAL_SOURCES;

  return (
    <>
      {international && <OfficialNoticeBanner className="mb-4" />}
      <form onSubmit={onSearch} className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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
        <label>
          <span className="sr-only">Tipo de oportunidade</span>
          <select
            data-testid="select-opportunity-kind"
            className={selectClass}
            value={params.kind?.[0] ?? ''}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="">Todos os tipos</option>
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {opportunityKindLabels[kind]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Fonte</span>
          <select
            data-testid="select-opportunity-source"
            className={selectClass}
            value={params.source?.[0] ?? ''}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="">Todas as fontes</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {opportunitySourceLabels[source]}
              </option>
            ))}
          </select>
        </label>
        {!international && (
          <label>
            <span className="sr-only">Estado</span>
            <select
              data-testid="select-opportunity-state"
              className={selectClass}
              value={params.state?.[0] ?? ''}
              onChange={(event) => setState(event.target.value)}
            >
              <option value="">Todos os estados</option>
              {stateOptions(UFS, facets).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="sr-only">Situação das inscrições</span>
          <select
            data-testid="select-opportunity-status"
            className={selectClass}
            value={params.status?.[0] ?? ''}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Qualquer prazo</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {opportunityStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </form>

      {international ? (
        <InternationalFilters params={params} facets={facets} onChange={update} />
      ) : (
        <OpportunityFilters params={params} facets={facets} hiddenIndividualListings={response?.meta.hiddenIndividualListings ?? 0} onChange={update} />
      )}

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
        <details data-testid="banner-installation-issues" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 type-ui text-foreground">
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
          {response.meta.gaps.length} estados não têm instalação estadual do Mapas Culturais: {response.meta.gaps.map((gap) => gap.uf).join(', ')}. Neles só
          entram chamadas de municípios com instalação própria.
        </p>
      )}

      {search.isPending ? (
        <RowsSkeleton />
      ) : search.isError ? (
        unavailable ? (
          <div data-testid="state-error" className="rounded-xl border border-dashed border-border-strong px-5 py-14 text-center">
            <h2 className="type-section">Chamadas temporariamente indisponíveis</h2>
            <p className="mx-auto mt-2 max-w-md type-body text-muted-foreground">O banco de editais nacionais não respondeu. Tente de novo em instantes.</p>
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
          <p className="mb-3 type-meta text-muted-foreground">
            {pagination ? `${formatNumber(pagination.total)} ${pagination.total === 1 ? 'chamada' : 'chamadas'}` : ''}
            {response?.meta.indexUpdatedAt ? ` · Atualizado em ${formatDateTime(response.meta.indexUpdatedAt)}` : ''}
          </p>
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {response?.data.map((opportunity) =>
              opportunity.international ? (
                <InternationalRow key={opportunity.id} opportunity={opportunity} />
              ) : (
                <OpportunityRow key={opportunity.id} opportunity={opportunity} />
              ),
            )}
          </ul>
          {pagination && <SearchPagination pagination={pagination} page={params.page ?? 1} onPageChange={(page) => update({ page })} />}
        </section>
      )}
    </>
  );
}
