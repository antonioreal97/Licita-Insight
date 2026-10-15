import React, { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { OpportunityArea, OpportunityKind, OpportunitySearchParams, OpportunitySearchResponse, OpportunitySource, OpportunityStatus } from '@/api';
import { DEADLINE_PRESET_DAYS, activeDeadlinePreset, deadlinePresetPatch } from '@/features/search/lib/filter-presets';
import { formatNumber } from '@/lib/format';
import { UFS } from '@/lib/ufs';
import {
  areaCounts,
  cityOptions,
  cityPatch,
  countMoreOpportunityFilters,
  individualListingsLabel,
  organizationOptions,
  selectedCityValue,
  statePatch,
  stateOptions,
  type FilterOption,
} from '../lib/opportunity-filters';
import { INTERNATIONAL_SOURCES, NATIONAL_KINDS, opportunityAreaLabels, opportunityKindLabels, opportunitySourceLabels, opportunityStatusLabels } from './opportunity-status';

export type OpportunityFilterDensity = 'compact' | 'comfortable';

const selectClass =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 type-ui text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const STATUSES = Object.keys(opportunityStatusLabels) as OpportunityStatus[];
const NATIONAL_SOURCES = (Object.keys(opportunitySourceLabels) as OpportunitySource[]).filter((source) => !INTERNATIONAL_SOURCES.includes(source));
/** Area pills shown before "Ver todas": the busiest ones. */
const AREAS_VISIBLE = 6;

type Props = {
  params: OpportunitySearchParams;
  facets: OpportunitySearchResponse['facets'];
  /** Individual listings the current filters leave out. */
  hiddenIndividualListings: number;
  onChange: (patch: Partial<OpportunitySearchParams>) => void;
  /** `comfortable` = stacked with 40px targets (phone sheet); `compact` = three columns above the list. */
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
};

function FilterSelect({
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

function Question({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="min-w-0 space-y-2" data-testid="opportunity-question">
      <div>
        <h3 id={titleId} className="type-ui font-semibold text-foreground">
          {title}
        </h3>
        <p className="type-meta text-muted-foreground">{help}</p>
      </div>
      {children}
    </section>
  );
}

const pillClass = (active: boolean, density: OpportunityFilterDensity) =>
  `inline-flex items-center gap-1.5 rounded-pill border px-3 type-meta font-semibold transition-colors duration-fast ease-standard focus-visible:focus-ring ${density === 'comfortable' ? 'min-h-10' : 'min-h-8'} ${
    active ? 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground' : 'border-border bg-transparent text-foreground hover:border-border-strong hover:bg-surface-sunken'
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
            <button key={area} type="button" aria-pressed={active} data-testid={`button-opportunity-area-${area}`} onClick={() => toggleArea(area)} className={pillClass(active, density)}>
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

/**
 * The national filters as three plain questions (Onde? O quê? Até quando?) plus "Mais filtros", folded by default.
 * Each control writes the same URL parameters as before.
 */
export function OpportunityFilters({ params, facets, hiddenIndividualListings, onChange, density = 'compact' }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const deadlinePreset = activeDeadlinePreset(params);
  const moreCount = countMoreOpportunityFilters(params);
  const showCity = Boolean(params.state?.length || params.city?.length);

  return (
    <div className="mb-4" data-testid="opportunity-filters">
      <div className={density === 'comfortable' ? 'space-y-6' : 'grid gap-6 sm:grid-cols-3'}>
        <Question title="Onde?" help="Estado e município de quem abriu a chamada.">
          <FilterSelect
            label="Estado"
            testId="select-opportunity-state"
            value={params.state?.[0] ?? ''}
            placeholder="Todos os estados"
            options={stateOptions(UFS, facets)}
            onChange={(value) => onChange(statePatch(value, facets, params))}
          />
          {showCity ? (
            <FilterSelect
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
        </Question>

        <Question title="O quê?" help="Fomento é dinheiro para tirar um projeto do papel; cultura reúne editais de arte.">
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
        </Question>

        <Question title="Até quando?" help="Quando as inscrições terminam.">
          <div role="group" aria-label="Inscrições encerram em até" className="flex flex-wrap gap-1.5">
            {DEADLINE_PRESET_DAYS.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={deadlinePreset === days}
                aria-label={`Inscrições encerram em até ${days} dias`}
                data-testid={`button-opportunity-deadline-${days}`}
                onClick={() => onChange(deadlinePreset === days ? { deadlineFrom: undefined, deadlineTo: undefined } : deadlinePresetPatch(days))}
                className={pillClass(deadlinePreset === days, density)}
              >
                Até {days} dias
              </button>
            ))}
          </div>
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
        </Question>
      </div>

      <section className="mt-4 border-t border-border-subtle pt-2">
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
                <span data-testid="badge-opportunity-more-filters" className="ml-1.5 rounded-pill bg-primary px-1.5 py-0.5 type-data text-xs leading-none font-bold text-primary-foreground">
                  {moreCount}
                  <span className="sr-only"> {moreCount === 1 ? 'ativo' : 'ativos'}</span>
                </span>
              )}
            </span>
            <ChevronDown size={15} aria-hidden className={`transition-transform duration-fast ease-standard ${moreOpen ? 'rotate-180' : ''}`} />
          </button>
        </h3>
        <div id={moreId} hidden={!moreOpen} data-testid="opportunity-more-filters" className="pt-3">
          <div className={density === 'comfortable' ? 'space-y-4' : 'grid gap-4 sm:grid-cols-3'}>
            <Question title="Instituição" help="Quem publicou: secretaria, fundação, prefeitura…">
              <FilterSelect
                label="Instituição"
                testId="select-opportunity-organization"
                value={params.organization?.[0] ?? ''}
                placeholder="Todas as instituições"
                options={organizationOptions(facets, params)}
                onChange={(value) => onChange({ organization: value ? [value] : undefined })}
              />
            </Question>
            <Question title="Fonte" help="O portal oficial de onde a chamada veio.">
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
            </Question>
            <Question title="Quem publica" help="Por padrão, só chamadas de órgãos e instituições.">
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
            </Question>
          </div>
        </div>
      </section>
    </div>
  );
}
