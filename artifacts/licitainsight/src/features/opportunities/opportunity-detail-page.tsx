import { useEffect } from 'react';
import { Link, useParams } from 'wouter';
import { ExternalLink } from 'lucide-react';
import { isApiError } from '@/api';
import { ErrorState } from '@/components/common/query-states';
import { formatDate, formatDateTime } from '@/lib/format';
import { OpportunityStatusBadge, opportunityProgramLabels } from './components/opportunity-status';
import { useOpportunity } from './hooks/use-opportunities';

const sourceLinkClass =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-xs ' +
  'transition-[background-color,scale] duration-fast ease-standard hover:bg-primary-hover active:scale-[0.98] active:bg-primary-active ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const query = useOpportunity(id);
  const opportunity = query.data;

  useEffect(() => {
    if (opportunity) document.title = `${opportunity.title} · LicitAI`;
    else if (query.isError && isApiError(query.error) && query.error.code === 'NOT_FOUND') {
      document.title = 'Chamada não encontrada · LicitAI';
    }
  }, [opportunity, query.isError, query.error]);

  if (query.isPending) {
    return (
      <div aria-busy="true" aria-label="Carregando chamada" className="space-y-4">
        <div className="h-3 w-40 animate-pulse rounded-sm bg-muted" />
        <div className="h-9 w-3/4 animate-pulse rounded-sm bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (query.isError) {
    if (isApiError(query.error) && query.error.code === 'NOT_FOUND') {
      return (
        <div data-testid="state-error" className="rounded-xl border border-dashed border-border-strong px-5 py-14 text-center">
          <h1 className="type-section">Chamada não encontrada</h1>
          <p className="mx-auto mt-2 max-w-md type-body text-muted-foreground">Esse id não está na coleta de chamadas culturais.</p>
          <Link href="/oportunidades" className="mt-4 inline-block type-ui font-semibold text-primary hover:underline">
            Voltar às chamadas
          </Link>
        </div>
      );
    }
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  if (!opportunity) return null;

  return (
    <article data-testid="opportunity-detail">
      <Link href="/oportunidades" className="type-meta font-semibold text-primary hover:underline">
        Chamadas culturais
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <OpportunityStatusBadge status={opportunity.status} />
        <span className="type-label text-muted-foreground">{opportunityProgramLabels[opportunity.program]}</span>
        <span className="type-label text-muted-foreground">{opportunity.state ?? 'Nacional'}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <h1 className="max-w-3xl type-display-sm text-foreground">{opportunity.title}</h1>
        {opportunity.sourceUrl && (
          <a
            href={opportunity.sourceUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="link-opportunity-source"
            className={sourceLinkClass}
          >
            Ver na fonte
            <ExternalLink size={16} aria-hidden />
          </a>
        )}
      </div>
      <p className="mt-3 type-body text-muted-foreground">{opportunity.organizationName}</p>
      <section className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-7">
        <h2 className="type-section text-foreground">Inscrições</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="type-label text-muted-foreground">Abertura</dt>
            <dd className="mt-1 type-ui">{formatDate(opportunity.registrationFrom)}</dd>
          </div>
          <div>
            <dt className="type-label text-muted-foreground">Encerramento</dt>
            <dd className="mt-1 type-ui">{formatDate(opportunity.registrationTo)}</dd>
          </div>
          <div>
            <dt className="type-label text-muted-foreground">Fonte</dt>
            <dd className="mt-1 type-ui">{opportunity.installation.name}</dd>
          </div>
          <div>
            <dt className="type-label text-muted-foreground">Atualizado em</dt>
            <dd className="mt-1 type-ui">{formatDateTime(opportunity.updatedAt)}</dd>
          </div>
        </dl>
        {opportunity.summary && <p className="mt-6 type-body text-foreground">{opportunity.summary}</p>}
      </section>
    </article>
  );
}
