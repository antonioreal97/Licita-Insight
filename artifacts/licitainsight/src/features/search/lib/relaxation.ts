import type { SearchFacets, TenderSearchParams } from '@/api';
import { FACET_GROUPS, labelFor, selectedValues } from './facet-config';

/** `exact` = `estimate` came from `groupTotals`, not from summing buckets. */
export type Relaxation = { label: string; estimate: number | null; exact?: boolean; patch: Partial<TenderSearchParams> };

/**
 * Picks the filter whose removal would bring back the most results.
 * v1.1 `groupTotals.<group>` is exactly the total without that group's filter. Without it (older servers, or
 * the city group, which has no total), disjunctive bucket counts approximate it: sum for single-valued fields;
 * category is multi-valued so the largest bucket is used as a lower bound.
 */
export function suggestRelaxation(params: TenderSearchParams, facets: SearchFacets | null | undefined): Relaxation | null {
  let best: Relaxation | null = null;
  if (facets) {
    for (const group of FACET_GROUPS) {
      const values = selectedValues(params, group.param);
      if (!values.length) continue;
      const buckets = facets[group.facet] ?? [];
      const total = group.facet === 'city' ? undefined : facets.groupTotals?.[group.facet];
      const estimate = total ?? (group.facet === 'category' ? Math.max(0, ...buckets.map((b) => b.count)) : buckets.reduce((sum, b) => sum + b.count, 0));
      if (estimate > 0 && (!best || estimate > (best.estimate ?? 0))) {
        const names = values.map((value) => labelFor(group.param, value));
        best = {
          label: `${group.title}: ${names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')}`,
          estimate,
          exact: total !== undefined,
          patch: { [group.param]: [] },
        };
      }
    }
  }
  if (best) return best;
  // No facet-based estimate: fall back to the ranges, which are usually the tightest constraints.
  if (params.valueMin !== undefined || params.valueMax !== undefined)
    return { label: 'Faixa de valor', estimate: null, patch: { valueMin: undefined, valueMax: undefined } };
  if (params.deadlineFrom || params.deadlineTo)
    return { label: 'Prazo de proposta', estimate: null, patch: { deadlineFrom: undefined, deadlineTo: undefined } };
  if (params.publishedFrom || params.publishedTo)
    return { label: 'Data de publicação', estimate: null, patch: { publishedFrom: undefined, publishedTo: undefined } };
  return null;
}
