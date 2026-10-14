import { useEffect } from 'react';
import { Link, useParams } from 'wouter';
import { ExternalLink } from 'lucide-react';
import { isApiError } from '@/api';
import { ErrorState } from '@/components/common/query-states';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { buttonClass } from '@/components/common/action-button';
import { AccessPanel, OpportunityAccessGate } from './components/access-gate';
import {
  IndividualListingBadge,
  OpportunityStatusBadge,
  opportunityAreaLabels,
  opportunityKindLabels,
  opportunityProgramLabels,
} from './components/opportunity-status';
import { deniedAccess, useOpportunity } from './hooks/use-opportunities';
import { BrazilProjectBadge, EligibilityBadge, FundingBadge, OfficialNoticeBanner } from './components/international';
import { amountTexts, deadlineTexts, originalTitle, placeLabel } from './lib/international';

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
          <p className="mx-auto mt-2 max-w-md type-body text-muted-foreground">Esse id não está na coleta de editais nacionais.</p>
          <Link href="/oportunidades" className="mt-4 inline-block type-ui font-semibold text-primary hover:underline">
            Voltar às chamadas
          </Link>
        </div>
      );
    }
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  if (!opportunity) return null;

  const international = opportunity.international;
  const original = international ? originalTitle(opportunity.title, international) : null;
  const deadline = international ? deadlineTexts(international.deadline) : null;
  const amount = international ? amountTexts(international, false) : null;

  return (
    <article data-testid="opportunity-detail">
      <Link
        href={international ? '/oportunidades?scope=international' : '/oportunidades'}
        className="type-meta font-semibold text-primary hover:underline"
      >
        {international ? 'Oportunidades internacionais' : 'Editais nacionais'}
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <OpportunityStatusBadge status={opportunity.status} />
        <span className="rounded-pill bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">{opportunity.sourceName}</span>
        <span className="type-label text-muted-foreground">{opportunity.opportunityType ?? opportunityKindLabels[opportunity.kind]}</span>
        {opportunity.program && opportunity.program !== 'audiovisual' && (
          <span className="type-label text-muted-foreground">{opportunityProgramLabels[opportunity.program]}</span>
        )}
        <span className="type-label text-muted-foreground">
          {international
            ? placeLabel(international)
            : opportunity.city && opportunity.state
              ? `${opportunity.city} (${opportunity.state})`
              : (opportunity.state ?? 'Nacional')}
        </span>
        {international?.brazilProject && <BrazilProjectBadge />}
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
      {original && (
        <p data-testid="text-opportunity-original-title" className="mt-2 max-w-3xl type-meta text-muted-foreground">
          <span className="font-semibold">Título original{international?.languageName ? ` (${international.languageName.toLowerCase()})` : ''}:</span>{' '}
          <span lang={international?.language ?? undefined}>{original}</span>
          {international?.translationSource === 'model' && ' · tradução automática'}
        </p>
      )}
      <p className="mt-3 type-body text-muted-foreground">{opportunity.organizationName}</p>
      {international && (
        <section
          aria-labelledby="opportunity-eligibility"
          data-testid="section-opportunity-eligibility"
          className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-7"
        >
          <h2 id="opportunity-eligibility" className="type-section text-foreground">
            Brasileiros podem participar?
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {international.brazilEligibility && (
              <div>
                <dt className="type-label text-muted-foreground">Pode participar</dt>
                <dd className="mt-2">
                  <EligibilityBadge answer={international.brazilEligibility} />
                  {international.brazilEligibility.reason && <p className="mt-2 type-ui">{international.brazilEligibility.reason}</p>}
                </dd>
              </div>
            )}
            {international.brazilFunding && (
              <div>
                <dt className="type-label text-muted-foreground">Recebe financiamento</dt>
                <dd className="mt-2">
                  <FundingBadge answer={international.brazilFunding} />
                  {international.brazilFunding.reason && <p className="mt-2 type-ui">{international.brazilFunding.reason}</p>}
                </dd>
              </div>
            )}
          </dl>
          <OfficialNoticeBanner className="mt-5" />
          {international.eligibilityCheckedAt && (
            <p className="mt-3 type-meta text-muted-foreground">Regra aplicada em {formatDateTime(international.eligibilityCheckedAt)}.</p>
          )}
        </section>
      )}
      {opportunity.individualListing && (
        <p data-testid="notice-individual-listing" className="mt-3 flex flex-wrap items-center gap-2 type-meta text-muted-foreground">
          <IndividualListingBadge />
          Publicado por uma pessoa física no Mapas Culturais, sem edital ou órgão público identificado. Confira na fonte antes de se inscrever.
        </p>
      )}
      <section className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-7">
        <h2 className="type-section text-foreground">{international ? 'Prazo e valor' : 'Inscrições'}</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="type-label text-muted-foreground">{international ? 'Publicação ou abertura' : 'Abertura'}</dt>
            <dd className="mt-1 type-ui">{formatDate(opportunity.registrationFrom)}</dd>
          </div>
          {deadline ? (
            <div data-testid="opportunity-deadline">
              <dt className="type-label text-muted-foreground">Prazo (horário de Brasília)</dt>
              <dd className="mt-1 type-ui font-semibold">{deadline.brasilia}</dd>
              {deadline.original && <dd className="mt-1 type-meta text-muted-foreground">No original: {deadline.original}</dd>}
              {deadline.note && <dd className="mt-1 type-meta text-muted-foreground">{deadline.note}</dd>}
            </div>
          ) : (
            <div>
              <dt className="type-label text-muted-foreground">Encerramento</dt>
              <dd className="mt-1 type-ui">
                {opportunity.continuousFlow && !opportunity.registrationTo ? 'Fluxo contínuo, sem data de encerramento' : formatDate(opportunity.registrationTo)}
              </dd>
            </div>
          )}
          {amount && (
            <div data-testid="opportunity-amount">
              <dt className="type-label text-muted-foreground">Valor na moeda original</dt>
              <dd className="mt-1 type-ui font-semibold">{amount.original}</dd>
              {amount.approx ? (
                <dd className="mt-1 type-meta text-muted-foreground">
                  {amount.approx}, pela {amount.quote} do Banco Central. Valor aproximado.
                </dd>
              ) : (
                <dd className="mt-1 type-meta text-muted-foreground">Sem cotação PTAX para converter.</dd>
              )}
            </div>
          )}
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
        {(opportunity.originName || opportunity.areas.length > 0) && (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {opportunity.originName && (
              <div>
                <dt className="type-label text-muted-foreground">Projeto de origem</dt>
                <dd className="mt-1 type-ui">{opportunity.originName}</dd>
              </div>
            )}
            {opportunity.areas.length > 0 && (
              <div data-testid="opportunity-areas">
                <dt className="type-label text-muted-foreground">Áreas culturais</dt>
                <dd className="mt-1 type-ui">{opportunity.areas.map((area) => opportunityAreaLabels[area]).join(', ')}</dd>
                {opportunity.areaTerms.length > 0 && <dd className="mt-1 type-meta text-muted-foreground">Na fonte: {opportunity.areaTerms.join(', ')}</dd>}
              </div>
            )}
          </dl>
        )}
        {international && international.details.length > 0 && (
          <dl data-testid="opportunity-source-details" className="mt-4 grid gap-4 sm:grid-cols-2">
            {international.details.map((detail) => (
              <div key={detail.label}>
                <dt className="type-label text-muted-foreground">{detail.label}</dt>
                <dd className="mt-1 type-ui">{detail.value}</dd>
              </div>
            ))}
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
