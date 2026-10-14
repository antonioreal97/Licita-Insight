import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ExternalLink, Info } from 'lucide-react';
import type { BrazilEligibility, OpportunityEligibilityAnswer, OpportunitySearchParams, OpportunitySearchResponse, OpportunitySummary } from '@/api';
import { INTERNATIONAL_REGIONS } from '@/services/opportunity-service';
import {
  amountLine,
  amountTexts,
  brazilEligibilityLabels,
  brazilFundingLabels,
  brazilProjectsPatch,
  deadlineTexts,
  ELIGIBILITY_ALL,
  ELIGIBILITY_DEFAULT,
  eligibilityOptions,
  eligibilityPatch,
  facetOptions,
  OFFICIAL_NOTICE_PREVAILS,
  originalTitle,
  placeLabel,
  selectedEligibility,
} from '../lib/international';
import type { FilterOption } from '../lib/opportunity-filters';
import { OpportunityStatusBadge } from './opportunity-status';

const tones: Record<BrazilEligibility, string> = {
  yes: 'bg-status-open text-status-open-foreground',
  conditional: 'border border-warning/40 bg-warning-subtle text-warning-subtle-foreground',
  no: 'bg-status-closed text-status-closed-foreground',
  unknown: 'bg-status-suspended text-status-suspended-foreground',
};

const badgeClass = 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-xs font-semibold';

/** "Aberto a brasileiros" / "Condicional"… The reason is always printed next to it, never only on hover. */
export function EligibilityBadge({ answer }: { answer: OpportunityEligibilityAnswer }) {
  return (
    <span data-testid={`badge-eligibility-${answer.status}`} className={`${badgeClass} ${tones[answer.status]}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {brazilEligibilityLabels[answer.status]}
    </span>
  );
}

/** Whether the funder pays a participant from Brazil: a different question from being allowed to take part. */
export function FundingBadge({ answer }: { answer: OpportunityEligibilityAnswer }) {
  return (
    <span data-testid={`badge-funding-${answer.status}`} className={`${badgeClass} border border-border bg-surface text-foreground`}>
      {brazilFundingLabels[answer.status]}
    </span>
  );
}

export function BrazilProjectBadge() {
  return (
    <span data-testid="badge-brazil-project" className={`${badgeClass} bg-primary-subtle text-primary-subtle-foreground`}>
      Projeto no Brasil
    </span>
  );
}

/** Fixed notice of the international section. */
export function OfficialNoticeBanner({ className = '' }: { className?: string }) {
  return (
    <p
      role="note"
      data-testid="notice-official-prevails"
      className={`flex items-start gap-2 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-muted-foreground ${className}`}
    >
      <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
      {OFFICIAL_NOTICE_PREVAILS}
    </p>
  );
}

const selectClass =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 type-ui text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function FilterSelect({
  label,
  testId,
  value,
  placeholder,
  options,
  onChange,
  children,
}: {
  label: string;
  testId: string;
  value: string;
  placeholder: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <label className="min-w-0 flex-1 sm:basis-52">
      <span className="sr-only">{label}</span>
      <select data-testid={testId} className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
    </label>
  );
}

type FiltersProps = {
  params: OpportunitySearchParams;
  facets: OpportunitySearchResponse['facets'];
  onChange: (patch: Partial<OpportunitySearchParams>) => void;
};

/** Funding body, region, language, type and eligibility, plus the "projects in Brazil" shortcut. */
export function InternationalFilters({ params, facets, onChange }: FiltersProps) {
  const inBrazil = params.country?.includes('BR') === true;
  const regions = facetOptions(facets?.region, params.region?.[0]).filter((option) => (INTERNATIONAL_REGIONS as string[]).includes(option.value));
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <FilterSelect
          label="Elegibilidade para brasileiros"
          testId="select-opportunity-eligibility"
          value={selectedEligibility(params)}
          placeholder="Aberto ou condicional"
          options={eligibilityOptions(facets)}
          onChange={(value) => onChange(eligibilityPatch(value))}
        >
          <option value={ELIGIBILITY_ALL}>Qualquer elegibilidade</option>
        </FilterSelect>
        <FilterSelect
          label="Organismo"
          testId="select-opportunity-agency"
          value={params.agency?.[0] ?? ''}
          placeholder="Todos os organismos"
          options={facetOptions(facets?.agency, params.agency?.[0])}
          onChange={(value) => onChange({ agency: value ? [value] : undefined })}
        />
        <FilterSelect
          label="Região"
          testId="select-opportunity-region"
          value={params.region?.[0] ?? ''}
          placeholder="Todas as regiões"
          options={regions}
          onChange={(value) => onChange({ region: value ? [value as (typeof INTERNATIONAL_REGIONS)[number]] : undefined })}
        />
        <FilterSelect
          label="Idioma do aviso"
          testId="select-opportunity-language"
          value={params.language?.[0] ?? ''}
          placeholder="Todos os idiomas"
          options={facetOptions(facets?.language, params.language?.[0])}
          onChange={(value) => onChange({ language: value ? [value] : undefined })}
        />
        <FilterSelect
          label="Tipo de chamada"
          testId="select-opportunity-type"
          value={params.opportunityType?.[0] ?? ''}
          placeholder="Bens, obras, consultoria, subvenção…"
          options={facetOptions(facets?.opportunityType, params.opportunityType?.[0])}
          onChange={(value) => onChange({ opportunityType: value ? [value] : undefined })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-pressed={inBrazil}
          data-testid="button-opportunity-brazil-projects"
          onClick={() => onChange(brazilProjectsPatch(params))}
          className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 type-meta font-semibold transition-colors duration-fast focus-visible:focus-ring ${
            inBrazil ? 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground' : 'border-border bg-surface text-foreground hover:border-border-strong'
          }`}
        >
          Só projetos no Brasil
        </button>
        {selectedEligibility(params) === ELIGIBILITY_DEFAULT && (
          <span className="type-meta text-muted-foreground">Mostrando o que um brasileiro pode disputar: “aberto” e “condicional”.</span>
        )}
      </div>
    </div>
  );
}

/** Deadline in Brasília time with the original next to it. */
export function DeadlineText({ opportunity }: { opportunity: OpportunitySummary }) {
  const texts = deadlineTexts(opportunity.international!.deadline);
  return (
    <span data-testid="text-opportunity-deadline">
      Prazo: <span className="font-semibold text-foreground">{texts.brasilia}</span>
      {texts.original && <> · no original: {texts.original}</>}
      {texts.note && <> · {texts.note}</>}
    </span>
  );
}

export function InternationalRow({ opportunity }: { opportunity: OpportunitySummary }) {
  const international = opportunity.international!;
  const original = originalTitle(opportunity.title, international);
  const amount = amountTexts(international);
  return (
    <li className="border-b border-border-subtle last:border-0">
      <div className="grid gap-3 px-4 py-4 transition-colors duration-fast ease-standard hover:bg-muted/60 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <OpportunityStatusBadge status={opportunity.status} />
          {international.brazilEligibility && <EligibilityBadge answer={international.brazilEligibility} />}
          {international.brazilFunding && <FundingBadge answer={international.brazilFunding} />}
          {international.brazilProject && <BrazilProjectBadge />}
          <span className="rounded-pill bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">{international.agency ?? opportunity.sourceName}</span>
          {opportunity.opportunityType && <span className="type-label text-muted-foreground">{opportunity.opportunityType}</span>}
          <span className="type-label text-muted-foreground">{placeLabel(international)}</span>
          {international.languageName && international.language !== 'pt' && (
            <span className="type-label text-muted-foreground">Aviso em {international.languageName.toLowerCase()}</span>
          )}
          {opportunity.profileMatch && <span className="type-label font-semibold text-primary">Combina com seu perfil</span>}
        </div>
        <Link href={`/oportunidades/${encodeURIComponent(opportunity.id)}`} data-testid={`opportunity-${opportunity.id}`}>
          <h2 className="type-section text-foreground hover:text-primary">{opportunity.title}</h2>
          {original && (
            <p lang={international.language ?? undefined} className="mt-1 type-meta text-muted-foreground">
              {original}
            </p>
          )}
          <p className="mt-2 type-meta text-muted-foreground">{opportunity.organizationName}</p>
          {opportunity.summary && <p className="mt-2 line-clamp-2 type-body text-muted-foreground">{opportunity.summary}</p>}
        </Link>
        {international.brazilEligibility?.reason && (
          <p data-testid="text-eligibility-reason" className="type-meta text-muted-foreground">
            <span className="font-semibold text-foreground">{brazilEligibilityLabels[international.brazilEligibility.status]}:</span>{' '}
            {international.brazilEligibility.reason}
          </p>
        )}
        <p className="type-meta text-muted-foreground">
          <DeadlineText opportunity={opportunity} />
          {amount && <> · Valor: {amountLine(amount)}</>}
        </p>
        {opportunity.sourceUrl && (
          <a
            href={opportunity.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 type-meta font-semibold text-primary hover:underline"
          >
            Ver aviso oficial <ExternalLink size={13} aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}
