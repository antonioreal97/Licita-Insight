import { useMemo } from 'react';
import type { SearchFacets, TenderSearchParams } from '@/api';
import { suggestRelaxation, type Relaxation } from '../lib/relaxation';
import { useTenderSearch } from './use-tender-search';

const countOnly = { page: 1, pageSize: 1, facets: false } as const;

/**
 * What to loosen when a search returns nothing. Facet-based suggestions carry their own count; range suggestions
 * (value, dates) have none, so a count request confirms that removing them brings results back. When it doesn't and
 * there is a text query, the query is the likely cause: suggest dropping it, again only if that yields results.
 * Returns `null` while a count is pending or when nothing single-step helps.
 */
export function useRelaxation(params: TenderSearchParams, facets: SearchFacets | null | undefined, empty: boolean, hasFilters: boolean): Relaxation | null {
  const candidate = useMemo(() => (empty ? suggestRelaxation(params, facets) : null), [empty, params, facets]);
  const rangeProbe = useTenderSearch({ ...params, ...candidate?.patch, ...countOnly }, { enabled: candidate?.estimate === null });
  const rangeTotal = rangeProbe.isPlaceholderData ? undefined : rangeProbe.data?.pagination.total;
  const queryProbeNeeded = empty && hasFilters && Boolean(params.q) && (!candidate || (candidate.estimate === null && rangeTotal === 0));
  const queryProbe = useTenderSearch({ ...params, q: undefined, ...countOnly }, { enabled: queryProbeNeeded });
  const queryTotal = queryProbe.isPlaceholderData ? undefined : queryProbe.data?.pagination.total;

  if (candidate && candidate.estimate !== null) return candidate;
  if (candidate && rangeTotal) return { ...candidate, estimate: rangeTotal, exact: true };
  if (queryProbeNeeded && queryTotal) return { label: `Busca por “${params.q}”`, estimate: queryTotal, exact: true, query: true, patch: { q: undefined } };
  return null;
}
