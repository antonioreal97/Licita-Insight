import type { FacetBucket, OpportunityArea, OpportunityCityBucket, OpportunitySearchParams, OpportunitySearchResponse } from '@/api';
import { formatNumber } from '@/lib/format';
import { OPPORTUNITY_AREAS } from '@/services/opportunity-service';
import { opportunityAreaLabels } from '../components/opportunity-status';

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
