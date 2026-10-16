import React, { useEffect, useId, useState, type ComponentProps, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type {
  OpportunityArea,
  OpportunityKind,
  OpportunityProgram,
  OpportunitySearchParams,
  OpportunitySearchResponse,
  OpportunitySource,
  OpportunityStatus,
} from '@/api';
import { GlossaryTerm } from '@/features/help/components/glossary-term';
import { DEADLINE_PRESET_DAYS, activeDeadlinePreset, deadlinePresetPatch } from '@/features/search/lib/filter-presets';
import { formatNumber } from '@/lib/format';
import { UFS } from '@/lib/ufs';
import {
  areaCounts,
  cityOptions,
  cityPatch,
  countMoreOpportunityFilters,
  individualListingsLabel,
  opportunityFacetOptions,
  organizationOptions,
  selectedCityValue,
  statePatch,
  stateOptions,
  type FilterOption,
} from '../lib/opportunity-filters';
import {
  INTERNATIONAL_SOURCES,
  NATIONAL_KINDS,
  opportunityAreaLabels,
  opportunityKindLabels,
  opportunityProgramLabels,
  opportunitySourceLabels,
  opportunityStatusLabels,
} from './opportunity-status';

export type OpportunityFilterDensity = 'compact' | 'comfortable';

const selectClass =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 type-ui text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const STATUSES = Object.keys(opportunityStatusLabels) as OpportunityStatus[];
const PROGRAMS = Object.keys(opportunityProgramLabels) as OpportunityProgram[];
const NATIONAL_SOURCES = (Object.keys(opportunitySourceLabels) as OpportunitySource[]).filter((source) => !INTERNATIONAL_SOURCES.includes(source));
/** Area pills shown before "Ver todas": the busiest ones. */
const AREAS_VISIBLE = 6;

type Props = {
  params: OpportunitySearchParams;
  facets: OpportunitySearchResponse['facets'];
  /** Individual listings the current filters leave out. */
  hiddenIndividualListings: number;
  onChange: (patch: Partial<OpportunitySearchParams>) => void;
  /** `comfortable` = 40px targets in the phone sheet; `compact` = desktop sidebar. */
  density?: OpportunityFilterDensity;
};

/** Everything the national filters can set; "Limpar" drops these and keeps the text search. */
export const CLEAR_NATIONAL_FILTERS: Partial<OpportunitySearchParams> = {
  state: undefined,
  city: undefined,
  area: undefined,
  kind: undefined,
  status: undefined,
  deadlineFrom: undefined,
  deadlineTo: undefined,
  organization: undefined,
  source: undefined,
  includeIndividual: undefined,
  program: undefined,
  installation: undefined,
};

export function OpportunityFilterSelect({
  label,
  testId,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  placeholder: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <select data-testid={testId} className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function OpportunityQuestion({ title, help, termId, children }: { title: string; help: string; termId?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="min-w-0 py-4" data-testid="opportunity-question">
      <div className="flex items-center gap-1">
        <h3 id={titleId} className="type-ui font-semibold text-foreground">
          {title}
        </h3>
        {termId && <GlossaryTerm termId={termId} variant="icon" className="-my-1" />}
      </div>
      <p className="mt-0.5 mb-2.5 type-meta text-muted-foreground">{help}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export const opportunityPillClass = (active: boolean, density: OpportunityFilterDensity) =>
  `inline-flex items-center gap-1.5 rounded-pill border px-3 type-meta font-semibold transition-colors duration-fast ease-standard focus-visible:focus-ring ${density === 'comfortable' ? 'min-h-10' : 'min-h-8'} ${
    active
      ? 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground'
      : 'border-border bg-transparent text-foreground hover:border-border-strong hover:bg-surface-sunken'
  }`;

function AreaPills({ params, facets, onChange, density }: Pick<Props, 'params' | 'facets' | 'onChange'> & { density: OpportunityFilterDensity }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const selectedArea = params.area?.[0];
  const counts = areaCounts(facets);
  // The selected area stays visible even when it has no calls under the other filters.
  const rows =
    selectedArea && !counts.some((row) => row.area === selectedArea)
      ? [...counts, { area: selectedArea, label: opportunityAreaLabels[selectedArea], count: 0 }]
      : counts;
  if (rows.length === 0) return <p className="type-meta text-muted-foreground">Nenhuma área com chamadas nestes filtros.</p>;
  const shown = expanded ? rows : rows.filter((row, index) => index < AREAS_VISIBLE || row.area === selectedArea);
  const toggleArea = (area: OpportunityArea) => onChange({ area: selectedArea === area ? undefined : [area] });
  return (
    <div>
      <div id={listId} data-testid="list-opportunity-areas" role="group" aria-label="Área cultural" className="flex flex-wrap gap-1.5">
        {shown.map(({ area, label, count }) => {
          const active = selectedArea === area;
          return (
            <button
              key={area}
              type="button"
              aria-pressed={active}
              data-testid={`button-opportunity-area-${area}`}
              onClick={() => toggleArea(area)}
              className={opportunityPillClass(active, density)}
            >
              {label}
              <span className="type-data font-normal text-muted-foreground">{formatNumber(count)}</span>
            </button>
          );
        })}
      </div>
      {rows.length > AREAS_VISIBLE && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          data-testid="button-opportunity-areas-more"
          onClick={() => setExpanded(!expanded)}
          className={`mt-1 rounded-lg px-1.5 text-xs font-semibold text-primary hover:underline focus-visible:focus-ring ${density === 'comfortable' ? 'min-h-10' : 'min-h-7'}`}
        >
          {expanded ? 'Ver menos' : `Ver todas (${formatNumber(rows.length)})`}
        </button>
      )}
    </div>
  );
}

function OpportunityDateInput({
  value,
  onCommit,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & { value: string | undefined; onCommit: (value: string | undefined) => void }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const commit = (next: string) => {
    if ((next || undefined) !== value) onCommit(next || undefined);
  };
  return (
    <input
      {...props}
      type="date"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) commit(event.target.value);
      }}
      onBlur={() => commit(draft)}
      className="h-10 w-full rounded-lg border border-input bg-background px-2 text-base text-foreground focus:border-ring sm:type-ui"
    />
  );
}

export function OpportunityDeadlineQuestion({ params, onChange, density }: Pick<Props, 'params' | 'onChange'> & { density: OpportunityFilterDensity }) {
  const deadlinePreset = activeDeadlinePreset(params);
  return (
    <OpportunityQuestion title="Até quando?" help="Último dia para enviar a inscrição.">
      <div role="group" aria-label="Inscrições encerram em até" className="flex flex-wrap gap-1.5">
        {DEADLINE_PRESET_DAYS.map((days) => (
          <button
            key={days}
            type="button"
            aria-pressed={deadlinePreset === days}
            aria-label={`Inscrições encerram em até ${days} dias`}
            data-testid={`button-opportunity-deadline-${days}`}
            onClick={() => onChange(deadlinePreset === days ? { deadlineFrom: undefined, deadlineTo: undefined } : deadlinePresetPatch(days))}
            className={opportunityPillClass(deadlinePreset === days, density)}
          >
            Até {days} dias
          </button>
        ))}
      </div>
      <div className={`grid gap-2 ${density === 'comfortable' ? 'grid-cols-2' : ''}`}>
        <label className="min-w-0 type-meta text-muted-foreground">
          De
          <OpportunityDateInput
            value={params.deadlineFrom}
            aria-label="Inscrições encerram a partir de"
            onCommit={(deadlineFrom) => onChange({ deadlineFrom })}
          />
        </label>
        <label className="min-w-0 type-meta text-muted-foreground">
          Até
          <OpportunityDateInput value={params.deadlineTo} aria-label="Inscrições encerram até" onCommit={(deadlineTo) => onChange({ deadlineTo })} />
        </label>
      </div>
    </OpportunityQuestion>
  );
}

export function OpportunityStatusQuestion({ params, onChange }: Pick<Props, 'params' | 'onChange'>) {
  return (
    <OpportunityQuestion title="Situação" help="Veja inscrições abertas, futuras ou já encerradas.">
      <label className="block min-w-0">
        <span className="sr-only">Situação das inscrições</span>
        <select
          data-testid="select-opportunity-status"
          className={selectClass}
          value={params.status?.[0] ?? ''}
          onChange={(event) => onChange({ status: event.target.value ? [event.target.value as OpportunityStatus] : undefined })}
        >
          <option value="">Qualquer situação</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {opportunityStatusLabels[status]}
            </option>
          ))}
        </select>
      </label>
    </OpportunityQuestion>
  );
}

/**
 * The national filters as three plain questions (Onde? O quê? Até quando?) plus "Mais filtros", folded by default.
 * Each control writes the same URL parameters as before.
 */
export function OpportunityFilters({ params, facets, hiddenIndividualListings, onChange, density = 'compact' }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const moreCount = countMoreOpportunityFilters(params);
  const showCity = Boolean(params.state?.length || params.city?.length);

  return (
    <div data-testid="opportunity-filters">
      <div>
        <OpportunityQuestion title="Onde?" help="Estado e município de quem abriu a chamada.">
          <OpportunityFilterSelect
            label="Estado"
            testId="select-opportunity-state"
            value={params.state?.[0] ?? ''}
            placeholder="Todos os estados"
            options={stateOptions(UFS, facets)}
            onChange={(value) => onChange(statePatch(value, facets, params))}
          />
          {showCity ? (
            <OpportunityFilterSelect
              label="Município"
              testId="select-opportunity-city"
              value={selectedCityValue(facets, params)}
              placeholder="Todos os municípios"
              options={cityOptions(facets, params)}
              onChange={(value) => onChange(cityPatch(value))}
            />
          ) : (
            <p className="type-meta text-muted-foreground">Escolha um estado para ver os municípios.</p>
          )}
        </OpportunityQuestion>

        <OpportunityQuestion title="O quê?" help="Área cultural e tipo de oportunidade." termId="edital">
          <label className="block min-w-0">
            <span className="sr-only">Tipo de chamada</span>
            <select
              data-testid="select-opportunity-kind"
              className={selectClass}
              value={params.kind?.[0] ?? ''}
              onChange={(event) => onChange({ kind: event.target.value ? [event.target.value as OpportunityKind] : undefined })}
            >
              <option value="">Todos os tipos</option>
              {NATIONAL_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {opportunityKindLabels[kind]}
                </option>
              ))}
            </select>
          </label>
          <AreaPills params={params} facets={facets} onChange={onChange} density={density} />
        </OpportunityQuestion>

        <OpportunityDeadlineQuestion params={params} onChange={onChange} density={density} />
      </div>

      <section className="border-t border-border-subtle pt-2">
        <h3>
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls={moreId}
            data-testid="button-opportunity-more-filters"
            onClick={() => setMoreOpen(!moreOpen)}
            className={`flex items-center gap-2 rounded-lg text-left type-ui font-semibold text-foreground transition-colors duration-fast ease-standard hover:text-primary focus-visible:focus-ring ${density === 'comfortable' ? 'min-h-10 w-full' : 'min-h-8'}`}
          >
            <span className={density === 'comfortable' ? 'flex-1' : undefined}>
              Mais filtros
              {moreCount > 0 && (
                <span
                  data-testid="badge-opportunity-more-filters"
                  className="ml-1.5 rounded-pill bg-primary px-1.5 py-0.5 type-data text-xs leading-none font-bold text-primary-foreground"
                >
                  {moreCount}
                  <span className="sr-only"> {moreCount === 1 ? 'ativo' : 'ativos'}</span>
                </span>
              )}
            </span>
            <ChevronDown size={15} aria-hidden className={`transition-transform duration-fast ease-standard ${moreOpen ? 'rotate-180' : ''}`} />
          </button>
        </h3>
        <div id={moreId} hidden={!moreOpen} data-testid="opportunity-more-filters" className="pt-3">
          <div>
            <OpportunityStatusQuestion params={params} onChange={onChange} />
            <OpportunityQuestion title="Instituição" help="Quem publicou: secretaria, fundação, prefeitura…">
              <OpportunityFilterSelect
                label="Instituição"
                testId="select-opportunity-organization"
                value={params.organization?.[0] ?? ''}
                placeholder="Todas as instituições"
                options={organizationOptions(facets, params)}
                onChange={(value) => onChange({ organization: value ? [value] : undefined })}
              />
            </OpportunityQuestion>
            <OpportunityQuestion title="Fonte" help="O portal oficial de onde a chamada veio.">
              <label className="block min-w-0">
                <span className="sr-only">Fonte</span>
                <select
                  data-testid="select-opportunity-source"
                  className={selectClass}
                  value={params.source?.[0] ?? ''}
                  onChange={(event) => onChange({ source: event.target.value ? [event.target.value as OpportunitySource] : undefined })}
                >
                  <option value="">Todas as fontes</option>
                  {NATIONAL_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {opportunitySourceLabels[source]}
                    </option>
                  ))}
                </select>
              </label>
              <OpportunityFilterSelect
                label="Portal local"
                testId="select-opportunity-installation"
                value={params.installation?.[0] ?? ''}
                placeholder="Todos os portais locais"
                options={opportunityFacetOptions(facets?.installation, params.installation?.[0])}
                onChange={(value) => onChange({ installation: value ? [value] : undefined })}
              />
            </OpportunityQuestion>
            <OpportunityQuestion title="Programa" help="Lei ou programa público ligado à oportunidade.">
              <label className="block min-w-0">
                <span className="sr-only">Programa</span>
                <select
                  data-testid="select-opportunity-program"
                  className={selectClass}
                  value={params.program?.[0] ?? ''}
                  onChange={(event) => onChange({ program: event.target.value ? [event.target.value as OpportunityProgram] : undefined })}
                >
                  <option value="">Todos os programas</option>
                  {PROGRAMS.map((program) => (
                    <option key={program} value={program}>
                      {opportunityProgramLabels[program]}
                    </option>
                  ))}
                </select>
              </label>
            </OpportunityQuestion>
            <OpportunityQuestion title="Quem publica" help="Por padrão, só chamadas de órgãos e instituições.">
              <label className={`flex w-fit items-start gap-2 type-meta text-muted-foreground ${density === 'comfortable' ? 'min-h-10' : ''}`}>
                <input
                  type="checkbox"
                  data-testid="checkbox-opportunity-individual"
                  className="mt-0.5 size-4 rounded border-input accent-primary"
                  checked={params.includeIndividual === true}
                  onChange={(event) => onChange({ includeIndividual: event.target.checked ? true : undefined })}
                />
                <span>
                  <span className="font-semibold text-foreground">{individualListingsLabel(hiddenIndividualListings, params.includeIndividual === true)}</span>
                  <span className="block">Aulas, oficinas e testes publicados por pessoas físicas, sem edital ou órgão público.</span>
                </span>
              </label>
            </OpportunityQuestion>
          </div>
        </div>
      </section>
    </div>
  );
}
