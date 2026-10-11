import React from 'react';
import type { OpportunityArea, OpportunitySearchParams, OpportunitySearchResponse } from '@/api';
import { formatNumber } from '@/lib/format';
import {
  areaCounts,
  areaOptions,
  cityOptions,
  cityPatch,
  individualListingsLabel,
  organizationOptions,
  selectedCityValue,
  type FilterOption,
} from '../lib/opportunity-filters';

const selectClass =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 type-ui text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

type Props = {
  params: OpportunitySearchParams;
  facets: OpportunitySearchResponse['facets'];
  /** Individual listings the current filters leave out. */
  hiddenIndividualListings: number;
  onChange: (patch: Partial<OpportunitySearchParams>) => void;
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
    <label className="min-w-0 flex-1 sm:basis-52">
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

/** Area, municipality and institution filters, the individual listings switch and the count of calls in each area. */
export function OpportunityFilters({ params, facets, hiddenIndividualListings, onChange }: Props) {
  const selectedArea = params.area?.[0];
  const counts = areaCounts(facets);
  const toggleArea = (area: OpportunityArea) => onChange({ area: selectedArea === area ? undefined : [area] });

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <FilterSelect
          label="Área cultural"
          testId="select-opportunity-area"
          value={selectedArea ?? ''}
          placeholder="Todas as áreas"
          options={areaOptions(facets, params.area)}
          onChange={(value) => onChange({ area: value ? [value as OpportunityArea] : undefined })}
        />
        <FilterSelect
          label="Município"
          testId="select-opportunity-city"
          value={selectedCityValue(facets, params)}
          placeholder="Todos os municípios"
          options={cityOptions(facets, params)}
          onChange={(value) => onChange(cityPatch(value))}
        />
        <FilterSelect
          label="Instituição"
          testId="select-opportunity-organization"
          value={params.organization?.[0] ?? ''}
          placeholder="Todas as instituições"
          options={organizationOptions(facets, params)}
          onChange={(value) => onChange({ organization: value ? [value] : undefined })}
        />
      </div>
      <label className="flex w-fit items-start gap-2 type-meta text-muted-foreground">
        <input
          type="checkbox"
          data-testid="checkbox-opportunity-individual"
          className="mt-0.5 size-4 rounded border-input accent-primary"
          checked={params.includeIndividual === true}
          onChange={(event) => onChange({ includeIndividual: event.target.checked ? true : undefined })}
        />
        <span>
          <span className="font-semibold text-foreground">{individualListingsLabel(hiddenIndividualListings, params.includeIndividual === true)}</span>
          <span className="block">Aulas, oficinas e testes publicados por pessoas físicas no Mapas Culturais, sem edital ou órgão público.</span>
        </span>
      </label>
      {counts.length > 0 && (
        <div data-testid="list-opportunity-areas" role="group" aria-label="Chamadas por área cultural" className="flex flex-wrap gap-2">
          {counts.map(({ area, label, count }) => {
            const active = selectedArea === area;
            return (
              <button
                key={area}
                type="button"
                aria-pressed={active}
                data-testid={`button-opportunity-area-${area}`}
                onClick={() => toggleArea(area)}
                className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 type-meta font-semibold transition-colors duration-fast focus-visible:focus-ring ${
                  active
                    ? 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground'
                    : 'border-border bg-surface text-foreground hover:border-border-strong'
                }`}
              >
                {label}
                <span className="type-data font-normal">{formatNumber(count)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
