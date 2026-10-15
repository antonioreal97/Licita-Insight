import type { BrazilEligibility, FacetBucket, OpportunityArea, OpportunityCityBucket, OpportunitySearchParams, OpportunitySearchResponse } from '@/api';
import { activeDeadlinePreset } from '@/features/search/lib/filter-presets';
import { formatDate, formatNumber } from '@/lib/format';
import { OPPORTUNITY_AREAS } from '@/services/opportunity-service';
import {
  opportunityAreaLabels,
  opportunityKindLabels,
  opportunityProgramLabels,
  opportunitySourceLabels,
  opportunityStatusLabels,
} from '../components/opportunity-status';
import { brazilEligibilityLabels, brazilFundingLabels, internationalRegionLabels } from './international';

type Facets = OpportunitySearchResponse['facets'];

export type FilterOption = { value: string; label: string; count: number };

const withCount = (label: string, count: number): string => `${label} (${formatNumber(count)})`;

/** Most calls first; "Outras áreas" is the catch-all and always closes the list. */
const byCount = <T extends { area: OpportunityArea; count: number }>(left: T, right: T): number =>
  Number(left.area === 'outras') - Number(right.area === 'outras') ||
  right.count - left.count ||
  OPPORTUNITY_AREAS.indexOf(left.area) - OPPORTUNITY_AREAS.indexOf(right.area);

/**
 * Areas that have calls under the other filters, most calls first. The selected area stays in the list even
 * at count 0, so it never disappears from the control that shows it.
 */
export function areaOptions(facets: Facets, selected: OpportunityArea[] = []): FilterOption[] {
  const counts = new Map((facets?.area ?? []).map((bucket) => [bucket.value, bucket.count]));
  return OPPORTUNITY_AREAS.map((area) => ({ area, count: counts.get(area) ?? 0 }))
    .filter(({ area, count }) => count > 0 || selected.includes(area))
    .sort(byCount)
    .map(({ area, count }) => ({ value: area, label: withCount(opportunityAreaLabels[area], count), count }));
}

/** Areas that have at least one call, for the count strip. */
export function areaCounts(facets: Facets): { area: OpportunityArea; label: string; count: number }[] {
  const known = new Set<string>(OPPORTUNITY_AREAS);
  return (facets?.area ?? [])
    .filter((bucket): bucket is FacetBucket & { value: OpportunityArea } => known.has(bucket.value) && bucket.count > 0)
    .map((bucket) => ({ area: bucket.value, label: opportunityAreaLabels[bucket.value], count: bucket.count }))
    .sort(byCount);
}

const cityKey = (city: string, state: string | null): string => `${state ?? ''}|${city}`;

/** Municipalities under the current filters. The value carries the UF, so homonyms in two states stay apart. */
export function cityOptions(facets: Facets, params: OpportunitySearchParams): FilterOption[] {
  const buckets: OpportunityCityBucket[] = [...(facets?.city ?? [])];
  const selected = params.city?.[0];
  if (selected && !buckets.some((bucket) => bucket.value === selected)) {
    buckets.push({ value: selected, label: selected, count: 0, state: params.state?.[0] ?? null });
  }
  return buckets
    .map((bucket) => ({ value: cityKey(bucket.value, bucket.state), label: withCount(bucket.label, bucket.count), count: bucket.count }))
    .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));
}

export function selectedCityValue(facets: Facets, params: OpportunitySearchParams): string {
  const city = params.city?.[0];
  if (!city) return '';
  const bucket = facets?.city.find((candidate) => candidate.value === city && (!params.state?.[0] || candidate.state === params.state[0]));
  return cityKey(city, bucket?.state ?? params.state?.[0] ?? null);
}

/** Choosing a municipality also sets its UF. Clearing it keeps the UF the person had picked. */
export function cityPatch(value: string): Partial<OpportunitySearchParams> {
  if (!value) return { city: undefined };
  const separator = value.indexOf('|');
  const state = value.slice(0, separator);
  const city = value.slice(separator + 1);
  return { city: [city], ...(state ? { state: [state] } : {}) };
}

/** Changing the UF drops a municipality of another UF. */
export function statePatch(value: string, facets: Facets, params: OpportunitySearchParams): Partial<OpportunitySearchParams> {
  const city = params.city?.[0];
  const cityState = city ? facets?.city.find((bucket) => bucket.value === city)?.state : undefined;
  const keepCity = !value || !city || cityState === undefined || cityState === value;
  return { state: value ? [value] : undefined, ...(keepCity ? {} : { city: undefined }) };
}

export function organizationOptions(facets: Facets, params: OpportunitySearchParams): FilterOption[] {
  const buckets: FacetBucket[] = [...(facets?.organization ?? [])];
  const selected = params.organization?.[0];
  if (selected && !buckets.some((bucket) => bucket.value === selected)) buckets.push({ value: selected, label: selected, count: 0 });
  return buckets
    .map((bucket) => ({ value: bucket.value, label: withCount(bucket.label, bucket.count), count: bucket.count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'pt-BR'));
}

/** Generic text facet options used by source installations and other API-labelled values. */
export function opportunityFacetOptions(buckets: FacetBucket[] | undefined, selected?: string): FilterOption[] {
  const options = [...(buckets ?? [])];
  if (selected && !options.some((bucket) => bucket.value === selected)) options.push({ value: selected, label: selected, count: 0 });
  return options
    .map((bucket) => ({ value: bucket.value, label: withCount(bucket.label, bucket.count), count: bucket.count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'pt-BR'));
}

/** What the "individual listings" switch says: how many the current filters leave out, when it is off. */
export function individualListingsLabel(hidden: number, included: boolean): string {
  const base = 'Incluir anúncios de proponentes individuais';
  return !included && hidden > 0 ? `${base} (${formatNumber(hidden)})` : base;
}

/** UFs with calls first is not needed: the list is short. Counts are shown where the facet has them. */
export function stateOptions(ufs: readonly string[], facets: Facets): FilterOption[] {
  const counts = new Map((facets?.state ?? []).map((bucket) => [bucket.value, bucket.count]));
  return ufs.map((uf) => {
    const count = counts.get(uf) ?? 0;
    return { value: uf, label: count > 0 ? withCount(uf, count) : uf, count };
  });
}

export type OpportunityFilterChip = { id: string; group: string; label: string; remove: Partial<OpportunitySearchParams> };

/** "Inscrições até 7 dias" for a shortcut, otherwise the dates. Same URL values as the search page shortcuts. */
export function registrationDeadlineLabel(from: string | undefined, to: string | undefined, now = new Date()): string {
  const preset = activeDeadlinePreset({ deadlineFrom: from, deadlineTo: to }, now);
  if (preset) return `Inscrições encerram em até ${preset} dias`;
  if (from && to) return `Inscrições encerram entre ${formatDate(from)} e ${formatDate(to)}`;
  if (from) return `Inscrições encerram a partir de ${formatDate(from)}`;
  return `Inscrições encerram até ${formatDate(to!)}`;
}

const eligibilityLabel = (status: BrazilEligibility): string => brazilEligibilityLabels[status];
const fundingLabel = (status: BrazilEligibility): string => brazilFundingLabels[status];

/** Removable chips for the active scope, including filters supplied by older links. */
export function opportunityFilterChips(params: OpportunitySearchParams, now = new Date(), facets?: Facets): OpportunityFilterChip[] {
  const chips: OpportunityFilterChip[] = [];
  const national = params.scope !== 'international';
  if (national) {
    params.state?.forEach((state) => chips.push({ id: `state:${state}`, group: 'Estado', label: state, remove: { state: undefined, city: undefined } }));
    params.city?.forEach((city) => chips.push({ id: `city:${city}`, group: 'Município', label: city, remove: { city: undefined } }));
    params.area?.forEach((area) => chips.push({ id: `area:${area}`, group: 'Área', label: opportunityAreaLabels[area], remove: { area: undefined } }));
  }
  params.kind?.forEach((kind) => chips.push({ id: `kind:${kind}`, group: 'Tipo', label: opportunityKindLabels[kind], remove: { kind: undefined } }));
  params.status?.forEach((status) =>
    chips.push({ id: `status:${status}`, group: 'Situação', label: opportunityStatusLabels[status], remove: { status: undefined } }),
  );
  if (params.deadlineFrom || params.deadlineTo) {
    chips.push({
      id: 'deadline',
      group: 'Prazo',
      label: registrationDeadlineLabel(params.deadlineFrom, params.deadlineTo, now),
      remove: { deadlineFrom: undefined, deadlineTo: undefined },
    });
  }
  if (national) {
    params.organization?.forEach((organization) =>
      chips.push({ id: `organization:${organization}`, group: 'Instituição', label: organization, remove: { organization: undefined } }),
    );
  }
  params.source?.forEach((source) =>
    chips.push({ id: `source:${source}`, group: 'Fonte', label: opportunitySourceLabels[source], remove: { source: undefined } }),
  );
  if (national) {
    params.program?.forEach((program) =>
      chips.push({ id: `program:${program}`, group: 'Programa', label: opportunityProgramLabels[program], remove: { program: undefined } }),
    );
    params.installation?.forEach((installation) => {
      const label = facets?.installation.find((bucket) => bucket.value === installation)?.label ?? installation;
      chips.push({ id: `installation:${installation}`, group: 'Portal', label, remove: { installation: undefined } });
    });
  } else {
    params.region?.forEach((region) =>
      chips.push({ id: `region:${region}`, group: 'Região', label: internationalRegionLabels[region], remove: { region: undefined } }),
    );
    params.country?.forEach((country) =>
      chips.push({ id: `country:${country}`, group: 'País', label: country === 'BR' ? 'Projetos no Brasil' : country, remove: { country: undefined } }),
    );
    params.opportunityType?.forEach((type) =>
      chips.push({ id: `opportunityType:${type}`, group: 'Tipo', label: type, remove: { opportunityType: undefined } }),
    );
    if (params.eligibility === 'all') {
      chips.push({ id: 'eligibility:all', group: 'Elegibilidade', label: 'Qualquer elegibilidade', remove: { eligibility: undefined } });
    } else {
      params.eligibility?.forEach((status) =>
        chips.push({ id: `eligibility:${status}`, group: 'Elegibilidade', label: eligibilityLabel(status), remove: { eligibility: undefined } }),
      );
    }
    params.funding?.forEach((status) =>
      chips.push({ id: `funding:${status}`, group: 'Financiamento', label: fundingLabel(status), remove: { funding: undefined } }),
    );
    params.agency?.forEach((agency) => chips.push({ id: `agency:${agency}`, group: 'Organismo', label: agency, remove: { agency: undefined } }));
    params.language?.forEach((language) => {
      const label = facets?.language.find((bucket) => bucket.value === language)?.label ?? language.toUpperCase();
      chips.push({ id: `language:${language}`, group: 'Idioma', label, remove: { language: undefined } });
    });
  }
  if (national && params.includeIndividual) {
    chips.push({ id: 'individual', group: 'Quem publica', label: 'Com anúncios de pessoas físicas', remove: { includeIndividual: undefined } });
  }
  return chips;
}

/** Chips that need their group name in front (an institution or a source name alone is a riddle). */
export const opportunityChipShowsGroup = (chip: { id: string }) => /^(?:organization|source|installation|opportunityType|agency|language):/.test(chip.id);

/** Count only the choices folded inside "Mais filtros" on the national list. */
export function countMoreOpportunityFilters(params: OpportunitySearchParams): number {
  return (
    (params.status?.length ?? 0) +
    (params.organization?.length ?? 0) +
    (params.source?.length ?? 0) +
    (params.program?.length ?? 0) +
    (params.installation?.length ?? 0) +
    (params.includeIndividual ? 1 : 0)
  );
}

/** International choices folded under “Mais filtros”: status, organism, source and notice language. */
export function countMoreInternationalFilters(params: OpportunitySearchParams): number {
  return (params.status?.length ?? 0) + (params.agency?.length ?? 0) + (params.source?.length ?? 0) + (params.language?.length ?? 0);
}
