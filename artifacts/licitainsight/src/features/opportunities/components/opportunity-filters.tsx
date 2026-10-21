import React, { useEffect, useId, useState, type ComponentProps, type ReactNode } from 'react';
import type {
  OpportunityArea,
  OpportunityKind,
  OpportunityProgram,
  OpportunitySearchParams,
  OpportunitySearchResponse,
  OpportunitySource,
  OpportunityStatus,
} from '@/api';
import {
  FilterDisclosure,
  FilterFieldLabel,
  FilterMoreSection,
  FilterQuestion,
  filterControlClass,
  filterLinkButtonClass,
  filterPresetClass,
  filterRowClass,
  type FilterDensity,
} from '@/components/filters/filter-primitives';
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

export type OpportunityFilterDensity = FilterDensity;

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
  /** `comfortable` = 44px targets in the phone sheet; `compact` = desktop sidebar. */
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
  density = 'compact',
}: {
  label: string;
  testId: string;
  value: string;
  placeholder: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  density?: OpportunityFilterDensity;
}) {
  return (
    <label className="block min-w-0">
      <FilterFieldLabel>{label}</FilterFieldLabel>
      <select data-testid={testId} className={filterControlClass(density)} value={value} onChange={(event) => onChange(event.target.value)}>
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

/** @deprecated Prefer FilterQuestion from filter-primitives; kept as alias for international.tsx imports. */
export function OpportunityQuestion({ title, help, termId, children }: { title: string; help: string; termId?: string; children: ReactNode }) {
  return (
    <FilterQuestion title={title} help={help} termId={termId} testId="opportunity-question">
      {children}
    </FilterQuestion>
  );
}

export const opportunityPillClass = (active: boolean, density: OpportunityFilterDensity) => filterPresetClass(active, density);

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
      <FilterFieldLabel>Área cultural</FilterFieldLabel>
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
              <span className={`type-data font-normal tabular-nums ${active ? 'opacity-80' : 'text-muted-foreground'}`}>
                {formatNumber(count)}
              </span>
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
          className={`mt-1 ${filterLinkButtonClass(density)}`}
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
  density,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string | undefined;
  onCommit: (value: string | undefined) => void;
  density: OpportunityFilterDensity;
}) {
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
      className={filterControlClass(density)}
    />
  );
}

export function OpportunityDeadlineQuestion({ params, onChange, density }: Pick<Props, 'params' | 'onChange'> & { density: OpportunityFilterDensity }) {
  const deadlinePreset = activeDeadlinePreset(params);
  const custom = Boolean((params.deadlineFrom || params.deadlineTo) && !deadlinePreset);
  const [datesOpen, setDatesOpen] = useState(false);
  const open = datesOpen || custom;
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
      <FilterDisclosure label="Escolher datas" open={open} onToggle={() => setDatesOpen(!open)} density={density} testId="button-opportunity-deadline-dates">
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0">
            <span className="mb-1 block type-meta text-muted-foreground">De</span>
            <OpportunityDateInput
              density={density}
              value={params.deadlineFrom}
              aria-label="Inscrições encerram a partir de"
              onCommit={(deadlineFrom) => onChange({ deadlineFrom })}
            />
          </label>
          <label className="min-w-0">
            <span className="mb-1 block type-meta text-muted-foreground">Até</span>
            <OpportunityDateInput
              density={density}
              value={params.deadlineTo}
              aria-label="Inscrições encerram até"
              onCommit={(deadlineTo) => onChange({ deadlineTo })}
            />
          </label>
        </div>
      </FilterDisclosure>
    </OpportunityQuestion>
  );
}

export function OpportunityStatusQuestion({ params, onChange, density = 'compact' }: Pick<Props, 'params' | 'onChange'> & { density?: OpportunityFilterDensity }) {
  return (
    <OpportunityQuestion title="Situação" help="Veja inscrições abertas, futuras ou já encerradas.">
      <label className="block min-w-0">
        <FilterFieldLabel>Situação das inscrições</FilterFieldLabel>
        <select
          data-testid="select-opportunity-status"
          className={filterControlClass(density)}
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
  const moreCount = countMoreOpportunityFilters(params);
  const showCity = Boolean(params.state?.length || params.city?.length);
  const individualId = useId();

  return (
    <div data-testid="opportunity-filters">
      <OpportunityQuestion title="Onde?" help="Estado e município de quem abriu a chamada.">
        <OpportunityFilterSelect
          label="Estado"
          testId="select-opportunity-state"
          value={params.state?.[0] ?? ''}
          placeholder="Todos os estados"
          options={stateOptions(UFS, facets)}
          density={density}
          onChange={(value) => onChange(statePatch(value, facets, params))}
        />
        {showCity ? (
          <OpportunityFilterSelect
            label="Município"
            testId="select-opportunity-city"
            value={selectedCityValue(facets, params)}
            placeholder="Todos os municípios"
            options={cityOptions(facets, params)}
            density={density}
            onChange={(value) => onChange(cityPatch(value))}
          />
        ) : (
          <p className="type-meta text-muted-foreground">Escolha um estado para ver os municípios.</p>
        )}
      </OpportunityQuestion>

      <OpportunityQuestion title="O quê?" help="Área cultural e tipo de oportunidade." termId="edital">
        <label className="block min-w-0">
          <FilterFieldLabel>Tipo de chamada</FilterFieldLabel>
          <select
            data-testid="select-opportunity-kind"
            className={filterControlClass(density)}
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

      <FilterMoreSection
        open={moreOpen}
        onOpenChange={setMoreOpen}
        count={moreCount}
        density={density}
        buttonTestId="button-opportunity-more-filters"
        panelTestId="opportunity-more-filters"
        badgeTestId="badge-opportunity-more-filters"
        summary="Situação, instituição, fonte, programa e quem publica."
      >
        <OpportunityStatusQuestion params={params} onChange={onChange} density={density} />
        <OpportunityQuestion title="Instituição" help="Quem publicou: secretaria, fundação, prefeitura…">
          <OpportunityFilterSelect
            label="Instituição"
            testId="select-opportunity-organization"
            value={params.organization?.[0] ?? ''}
            placeholder="Todas as instituições"
            options={organizationOptions(facets, params)}
            density={density}
            onChange={(value) => onChange({ organization: value ? [value] : undefined })}
          />
        </OpportunityQuestion>
        <OpportunityQuestion title="Fonte" help="O portal oficial de onde a chamada veio.">
          <label className="block min-w-0">
            <FilterFieldLabel>Fonte</FilterFieldLabel>
            <select
              data-testid="select-opportunity-source"
              className={filterControlClass(density)}
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
            density={density}
            onChange={(value) => onChange({ installation: value ? [value] : undefined })}
          />
        </OpportunityQuestion>
        <OpportunityQuestion title="Programa" help="Lei ou programa público ligado à oportunidade.">
          <label className="block min-w-0">
            <FilterFieldLabel>Programa</FilterFieldLabel>
            <select
              data-testid="select-opportunity-program"
              className={filterControlClass(density)}
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
          <label
            htmlFor={individualId}
            className={`-mx-1.5 flex ${filterRowClass(density)} w-full cursor-pointer items-start gap-2.5 rounded-lg px-1.5 type-ui text-foreground transition-colors duration-fast ease-standard hover:bg-surface-sunken`}
          >
            <input
              id={individualId}
              type="checkbox"
              data-testid="checkbox-opportunity-individual"
              className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
              checked={params.includeIndividual === true}
              onChange={(event) => onChange({ includeIndividual: event.target.checked ? true : undefined })}
            />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{individualListingsLabel(hiddenIndividualListings, params.includeIndividual === true)}</span>
              <span className="mt-0.5 block type-meta text-muted-foreground">Aulas, oficinas e testes publicados por pessoas físicas, sem edital ou órgão público.</span>
            </span>
          </label>
        </OpportunityQuestion>
      </FilterMoreSection>
    </div>
  );
}
