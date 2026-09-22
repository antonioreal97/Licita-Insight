import type { SearchFacets, TenderSearchParams } from '@/api';
import { modalityLabels, statusLabels } from '@/lib/tender-labels';

/** Multi-value filter keys in `TenderSearchParams` that are backed by a facet group. */
export type ArrayFilterKey = 'status' | 'modality' | 'state' | 'category' | 'sourceId' | 'organizationId';
export type FacetKey = 'status' | 'modality' | 'state' | 'source' | 'category' | 'organization';

export type FacetGroupConfig = {
  param: ArrayFilterKey;
  facet: FacetKey;
  title: string;
  /** Singular noun used in chips/empty-state copy ("Remover filtro de órgão"). */
  noun: string;
  searchPlaceholder?: string;
  /** Options shown before "Ver mais". */
  visible: number;
};

export const FACET_GROUPS: FacetGroupConfig[] = [
  { param: 'status', facet: 'status', title: 'Status', noun: 'status', visible: 6 },
  { param: 'modality', facet: 'modality', title: 'Modalidade', noun: 'modalidade', visible: 5 },
  { param: 'state', facet: 'state', title: 'Estado (UF)', noun: 'estado', visible: 6, searchPlaceholder: 'Buscar UF' },
  { param: 'category', facet: 'category', title: 'Categoria', noun: 'categoria', visible: 6, searchPlaceholder: 'Buscar categoria' },
  { param: 'organizationId', facet: 'organization', title: 'Órgão', noun: 'órgão', visible: 5, searchPlaceholder: 'Buscar órgão' },
  { param: 'sourceId', facet: 'source', title: 'Fonte', noun: 'fonte', visible: 5 },
];

/**
 * Remembers labels seen in facets/suggestions so a chip keeps its human label even when the value
 * falls out of the current facet buckets (e.g. organization outside the top 20).
 */
const labelCache = new Map<string, string>();
const cacheKey = (param: ArrayFilterKey, value: string) => `${param}:${value}`;

export function rememberLabel(param: ArrayFilterKey, value: string, label: string) {
  labelCache.set(cacheKey(param, value), label);
}

export function rememberFacetLabels(facets: SearchFacets | null | undefined) {
  if (!facets) return;
  for (const group of FACET_GROUPS) for (const bucket of facets[group.facet]) rememberLabel(group.param, bucket.value, bucket.label);
}

export function labelFor(param: ArrayFilterKey, value: string) {
  if (param === 'status') return statusLabels[value as keyof typeof statusLabels] ?? value;
  if (param === 'modality') return modalityLabels[value as keyof typeof modalityLabels] ?? value;
  return labelCache.get(cacheKey(param, value)) ?? value;
}

export const selectedValues = (params: TenderSearchParams, key: ArrayFilterKey) => (params[key] as string[] | undefined) ?? [];
