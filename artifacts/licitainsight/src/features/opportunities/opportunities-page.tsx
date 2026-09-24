import { FormEvent } from 'react';
import { Link } from 'wouter';
import { SearchX } from 'lucide-react';
import { isApiError, type OpportunityStatus, type OpportunitySummary } from '@/api';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { SearchPagination } from '@/features/search/components/search-pagination';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { deniedAccess, useOpportunitySearch } from './hooks/use-opportunities';
import { useOpportunityUrlState } from './hooks/use-opportunity-url-state';
import { AccessPanel, OpportunityAccessGate } from './components/access-gate';
import { OpportunityStatusBadge, opportunityProgramLabels, opportunityStatusLabels } from './components/opportunity-status';

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

const selectClass =
  'h-10 rounded-lg border border-border bg-card px-3 type-ui text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function OpportunityRow({ opportunity }: { opportunity: OpportunitySummary }) {
  const place = opportunity.state ?? 'Nacional';
  return (
    <li className="border-b border-border-subtle last:border-0">
      <Link
        href={`/oportunidades/${encodeURIComponent(opportunity.id)}`}
        data-testid={`opportunity-${opportunity.id}`}
        className="grid gap-3 px-4 py-4 transition-colors duration-fast ease-standard hover:bg-muted/60 sm:px-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <OpportunityStatusBadge status={opportunity.status} />
          <span className="type-label text-muted-foreground">{opportunityProgramLabels[opportunity.program]}</span>
          <span className="type-label text-muted-foreground">{place}</span>
        </div>
        <h2 className="type-section text-foreground">{opportunity.title}</h2>
        <p className="type-meta text-muted-foreground">
          {opportunity.organizationName}
          {' · '}
          {opportunity.installation.name}
        </p>
        {opportunity.summary && <p className="line-clamp-2 type-body text-muted-foreground">{opportunity.summary}</p>}
        <p className="type-meta text-muted-foreground">
          Inscrições {formatDate(opportunity.registrationFrom)} – {formatDate(opportunity.registrationTo)}
        </p>
      </Link>
    </li>
  );
}

export default function OpportunitiesPage() {
  return (
    <>
      <PageTitle
        eyebrow="audiovisual"
        title="Chamadas culturais"
        description="Fomento do Mapa da Cultura e das secretarias que publicam no Mapas Culturais. Licitações do PNCP continuam em Explorar editais."
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

  const setState = (value: string) => update({ state: value ? [value] : undefined });
  const setStatus = (value: string) => update({ status: value ? [value as OpportunityStatus] : undefined });

  return (
    <>
      <form onSubmit={onSearch} className="mb-4 flex flex-col gap-3 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Buscar chamadas</span>
          <input
            key={params.q ?? ''}
            name="q"
            defaultValue={params.q ?? ''}
            data-testid="input-opportunity-query"
            placeholder="Título, órgão ou resumo"
            className="h-10 w-full rounded-lg border border-border bg-card px-3 type-ui text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>
        <label>
          <span className="sr-only">Estado</span>
          <select
            data-testid="select-opportunity-state"
            className={selectClass}
            value={params.state?.[0] ?? ''}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="">Todos os estados</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </label>
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

      {response && response.meta.installationIssues.length > 0 && (
        <div data-testid="banner-installation-issues" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 type-ui text-foreground">
          <p className="font-semibold">Algumas fontes não responderam por completo.</p>
          <ul className="mt-2 space-y-1">
            {response.meta.installationIssues.map((issue) => (
              <li key={issue.installationId}>
                {issue.name}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {response && response.meta.gaps.length > 0 && (
        <p data-testid="banner-gaps" className="mb-4 type-meta text-muted-foreground">
          {response.meta.gaps.length} estados ainda não publicam no Mapas Culturais e ficam de fora desta lista:{' '}
          {response.meta.gaps.map((gap) => gap.uf).join(', ')}.
        </p>
      )}

      {search.isPending ? (
        <RowsSkeleton />
      ) : search.isError ? (
        unavailable ? (
          <div data-testid="state-error" className="rounded-xl border border-dashed border-border-strong px-5 py-14 text-center">
            <h2 className="type-section">Chamadas temporariamente indisponíveis</h2>
            <p className="mx-auto mt-2 max-w-md type-body text-muted-foreground">O banco de chamadas culturais não respondeu. Tente de novo em instantes.</p>
          </div>
        ) : (
          <ErrorState error={search.error} onRetry={() => search.refetch()} />
        )
      ) : response && response.data.length === 0 ? (
        <div data-testid="state-empty" className="rounded-xl border border-dashed border-border-strong px-5 py-14 text-center">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-secondary text-muted-foreground">
            <SearchX size={19} aria-hidden />
          </div>
          <h2 className="mt-4 type-section">Nenhuma chamada encontrada</h2>
          <p className="mx-auto mt-2 max-w-md type-body text-muted-foreground">
            Não há chamadas de audiovisual com esses filtros. A coleta ainda pode não ter rodado.
          </p>
        </div>
      ) : (
        <section aria-label="Chamadas culturais" data-testid="list-opportunities">
          <p className="mb-3 type-meta text-muted-foreground">
            {pagination ? `${formatNumber(pagination.total)} ${pagination.total === 1 ? 'chamada' : 'chamadas'}` : ''}
            {response?.meta.indexUpdatedAt ? ` · Atualizado em ${formatDateTime(response.meta.indexUpdatedAt)}` : ''}
          </p>
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {response?.data.map((opportunity) => (
              <OpportunityRow key={opportunity.id} opportunity={opportunity} />
            ))}
          </ul>
          {pagination && <SearchPagination pagination={pagination} page={params.page ?? 1} onPageChange={(page) => update({ page })} />}
        </section>
      )}
    </>
  );
}
