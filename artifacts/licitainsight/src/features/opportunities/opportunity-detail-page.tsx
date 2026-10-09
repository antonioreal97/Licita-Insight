import { useEffect } from 'react';
import { Link, useParams } from 'wouter';
import { ExternalLink } from 'lucide-react';
import { isApiError } from '@/api';
import { ErrorState } from '@/components/common/query-states';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { buttonClass } from '@/components/common/action-button';
import { AccessPanel, OpportunityAccessGate } from './components/access-gate';
import { OpportunityStatusBadge, opportunityKindLabels, opportunityProgramLabels } from './components/opportunity-status';
import { deniedAccess, useOpportunity } from './hooks/use-opportunities';

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando chamada" className="space-y-4">
      <div className="h-3 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-9 w-3/4 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

export default function OpportunityDetailPage() {
  return (
    <OpportunityAccessGate loading={<DetailSkeleton />}>
      <OpportunityDetail />
    </OpportunityAccessGate>
  );
}

function OpportunityDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const query = useOpportunity(id);
  const opportunity = query.data;

  useEffect(() => {
    if (opportunity) document.title = `${opportunity.title} · Pardal Digital`;
    else if (query.isError && isApiError(query.error) && query.error.code === 'NOT_FOUND') {
      document.title = 'Chamada não encontrada · Pardal Digital';
    }
  }, [opportunity, query.isError, query.error]);

  if (query.isPending) return <DetailSkeleton />;

  if (query.isError) {
    const denied = deniedAccess(query.error);
    if (denied) return <AccessPanel reason={denied} />;
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
        <span className="rounded-pill bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">{opportunity.sourceName}</span>
        <span className="type-label text-muted-foreground">{opportunityKindLabels[opportunity.kind]}</span>
        {opportunity.program && <span className="type-label text-muted-foreground">{opportunityProgramLabels[opportunity.program]}</span>}
        <span className="type-label text-muted-foreground">{opportunity.state ?? 'Nacional'}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <h1 className="max-w-3xl type-titulo-3 text-foreground">{opportunity.title}</h1>
        {opportunity.sourceUrl && (
          <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" data-testid="link-opportunity-source" className={buttonClass()}>
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
            <dd className="mt-1 type-ui">{opportunity.sourceName}</dd>
          </div>
          <div>
            <dt className="type-label text-muted-foreground">Atualizado em</dt>
            <dd className="mt-1 type-ui">{formatDateTime(opportunity.updatedAt)}</dd>
          </div>
        </dl>
        {(opportunity.audience || opportunity.amount !== null) && (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {opportunity.audience && (
              <div>
                <dt className="type-label text-muted-foreground">Público</dt>
                <dd className="mt-1 type-ui">{opportunity.audience}</dd>
              </div>
            )}
            {opportunity.amount !== null && (
              <div>
                <dt className="type-label text-muted-foreground">Valor informado</dt>
                <dd className="mt-1 type-ui">{formatCurrency(opportunity.amount)}</dd>
              </div>
            )}
          </dl>
        )}
        {opportunity.summary && <p className="mt-6 type-body text-foreground">{opportunity.summary}</p>}
        {opportunity.documents.length > 0 && (
          <div className="mt-6">
            <h2 className="type-section text-foreground">Documentos oficiais</h2>
            <ul className="mt-3 space-y-2">
              {opportunity.documents.map((document) => (
                <li key={document.url}>
                  <a href={document.url} target="_blank" rel="noreferrer" className="type-ui font-semibold text-primary hover:underline">
                    {document.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {opportunity.profileMatch && (
          <p className="mt-6 rounded-lg bg-secondary px-4 py-3 type-ui text-secondary-foreground">{opportunity.profileMatch.reasons.join(' · ')}</p>
        )}
      </section>
    </article>
  );
}
