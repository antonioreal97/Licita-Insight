import type { SearchFacets, TenderSearchParams, TenderStatus } from '@/api';
import { modalityLabels } from '@/lib/tender-labels';
import { UF_NAMES, type Uf } from '@/lib/ufs';

/** Multi-value filter keys in `TenderSearchParams` that are backed by a facet group. */
export type ArrayFilterKey = 'status' | 'modality' | 'state' | 'city' | 'category' | 'platform' | 'sourceId' | 'organizationId';
export type FacetKey = 'status' | 'modality' | 'state' | 'city' | 'source' | 'category' | 'platform' | 'organization';

export type FacetGroupConfig = {
  param: ArrayFilterKey;
  facet: FacetKey;
  /** Plain name, used in chips, the relaxation hint and screen reader labels ("Remover filtro Órgão: …"). */
  title: string;
  /** Singular noun used in chips/empty-state copy ("Remover filtro de órgão"). */
  noun: string;
  searchPlaceholder?: string;
  /** Options shown before "Ver todas". */
  visible: number;
  /** One short line under the group title, in everyday words. */
  help?: string;
  /** Glossary entry opened by the help icon beside the title. */
  termId?: string;
};

export const FACET_GROUPS: FacetGroupConfig[] = [
  {
    param: 'status',
    facet: 'status',
    title: 'Situação',
    noun: 'situação',
    visible: 5,
    help: 'A busca abre só nos abertos, que ainda recebem propostas. Desmarque para ver os demais.',
  },
  {
    param: 'modality',
    facet: 'modality',
    title: 'Modalidade',
    noun: 'modalidade',
    visible: 4,
    help: 'Como a disputa acontece. Pregão eletrônico é o mais comum para quem está começando.',
    termId: 'pregao',
  },
  { param: 'state', facet: 'state', title: 'Estado', noun: 'estado', visible: 5, searchPlaceholder: 'Buscar estado' },
  // v1.1: value = IBGE code, label = "Município/UF" (top 30).
  { param: 'city', facet: 'city', title: 'Município', noun: 'município', visible: 5, searchPlaceholder: 'Buscar município' },
  { param: 'category', facet: 'category', title: 'Categoria', noun: 'categoria', visible: 5, searchPlaceholder: 'Buscar categoria' },
  // Value = normalized slug. "Sistema de origem"/"Outro sistema" buckets are the publisher, not the room.
  {
    param: 'platform',
    facet: 'platform',
    title: 'Plataforma de disputa',
    noun: 'plataforma',
    visible: 4,
    searchPlaceholder: 'Buscar plataforma',
    help: 'O site onde você envia a proposta e dá lances. Cada um pede um cadastro próprio.',
    termId: 'plataforma-disputa',
  },
  {
    param: 'organizationId',
    facet: 'organization',
    title: 'Órgão',
    noun: 'órgão',
    visible: 4,
    searchPlaceholder: 'Buscar órgão',
    help: 'Quem está comprando: prefeitura, secretaria, universidade, hospital…',
  },
  { param: 'sourceId', facet: 'source', title: 'Fonte', noun: 'fonte', visible: 4, help: 'O portal público onde o Pardal encontrou o edital.' },
];

export const facetGroup = (param: ArrayFilterKey) => FACET_GROUPS.find((group) => group.param === param)!;

/** Status in filter words (plural, plain): the API values are unchanged. Badges keep `statusLabels`. */
export const statusFilterLabels: Record<TenderStatus, string> = {
  open: 'Abertos',
  under_review: 'Em análise',
  closed: 'Encerrados',
  suspended: 'Suspensos',
  cancelled: 'Revogados (cancelados)',
};

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
  for (const group of FACET_GROUPS) for (const bucket of facets[group.facet] ?? []) rememberLabel(group.param, bucket.value, bucket.label);
}

/** Status and modality are enums: always the app's PT-BR labels (the API's bucket labels differ, e.g. "Aberta" vs badge "Aberto"). */
export function labelFor(param: ArrayFilterKey, value: string) {
  if (param === 'status') return statusFilterLabels[value as TenderStatus] ?? value;
  if (param === 'modality') return modalityLabels[value as keyof typeof modalityLabels] ?? value;
  return labelCache.get(cacheKey(param, value)) ?? value;
}

export const selectedValues = (params: TenderSearchParams, key: ArrayFilterKey) => (params[key] as string[] | undefined) ?? [];

/** What the option list shows: the state's name next to its code ("São Paulo (SP)"); everything else as in chips. */
export function optionLabelFor(param: ArrayFilterKey, value: string, label: string) {
  if (param === 'state') {
    const name = UF_NAMES[value as Uf];
    return name ? `${name} (${value})` : label;
  }
  return label;
}
