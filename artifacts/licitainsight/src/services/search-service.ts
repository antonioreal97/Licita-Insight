import { searchAdapter, type Modality, type SortOption, type TenderSearchParams, type TenderStatus } from '@/api';

export const DEFAULT_PAGE_SIZE = 20;

const STATUSES: TenderStatus[] = ['open', 'under_review', 'closed', 'suspended', 'cancelled'];
const SORTS: SortOption[] = ['relevance', 'deadline_asc', 'published_desc', 'value_desc', 'value_asc'];
const MODALITIES: Modality[] = [
  'pregao_eletronico',
  'pregao_presencial',
  'concorrencia',
  'concorrencia_eletronica',
  'dispensa',
  'inexigibilidade',
  'credenciamento',
  'leilao',
  'dialogo_competitivo',
  'other',
];

const ARRAY_KEYS = ['status', 'modality', 'state', 'city', 'organizationId', 'sourceId', 'category'] as const;
const NUMBER_KEYS = ['valueMin', 'valueMax'] as const;
const DATE_KEYS = ['publishedFrom', 'publishedTo', 'deadlineFrom', 'deadlineTo'] as const;

/** Drops empty values and clamps paging so the adapter always receives a canonical request. */
export function normalizeSearchParams(params: TenderSearchParams): TenderSearchParams {
  const out: TenderSearchParams = {};
  const q = params.q?.trim();
  if (q) out.q = q;
  if (params.mode && params.mode !== 'keyword') out.mode = params.mode;
  for (const key of ARRAY_KEYS) {
    const list = params[key] as string[] | undefined;
    if (list?.length) (out as Record<string, unknown>)[key] = [...new Set(list)].sort();
  }
  for (const key of NUMBER_KEYS) if (typeof params[key] === 'number' && Number.isFinite(params[key])) out[key] = params[key];
  for (const key of DATE_KEYS) if (params[key]) out[key] = params[key];
  if (params.sort && params.sort !== 'relevance') out.sort = params.sort;
  if (params.page && params.page > 1) out.page = Math.floor(params.page);
  out.pageSize = Math.min(100, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  if (params.facets === false) out.facets = false;
  return out;
}

/** URL ⇄ params. The URL is the source of truth for search state (shareable, back/forward safe). */
export function searchParamsFromUrl(search: string): TenderSearchParams {
  const url = new URLSearchParams(search);
  const params: TenderSearchParams = {};
  const q = url.get('q');
  if (q) params.q = q;
  for (const key of ARRAY_KEYS) {
    const values = url.getAll(key).filter(Boolean);
    if (values.length) (params as Record<string, unknown>)[key] = values;
  }
  params.status = params.status?.filter((s): s is TenderStatus => STATUSES.includes(s));
  params.modality = params.modality?.filter((m): m is Modality => MODALITIES.includes(m));
  for (const key of NUMBER_KEYS) {
    const value = Number(url.get(key));
    if (url.get(key) && Number.isFinite(value)) params[key] = value;
  }
  for (const key of DATE_KEYS) {
    const value = url.get(key);
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) params[key] = value;
  }
  const sort = url.get('sort') as SortOption | null;
  if (sort && SORTS.includes(sort)) params.sort = sort;
  const page = Number(url.get('page'));
  if (Number.isInteger(page) && page > 1) params.page = page;
  const pageSize = Number(url.get('pageSize'));
  if (Number.isInteger(pageSize) && pageSize > 0) params.pageSize = pageSize;
  return normalizeSearchParams(params);
}

export function searchParamsToUrl(params: TenderSearchParams): string {
  const { pageSize, facets: _facets, ...rest } = normalizeSearchParams(params);
  const url = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (Array.isArray(value)) value.forEach((item) => url.append(key, String(item)));
    else if (value !== undefined) url.set(key, String(value));
  }
  if (pageSize !== DEFAULT_PAGE_SIZE) url.set('pageSize', String(pageSize));
  const text = url.toString();
  return text ? `?${text}` : '';
}

export function countActiveFilters(params: TenderSearchParams) {
  return (
    ARRAY_KEYS.reduce((sum, key) => sum + ((params[key] as string[] | undefined)?.length ?? 0), 0) +
    NUMBER_KEYS.filter((key) => params[key] !== undefined).length +
    DATE_KEYS.filter((key) => params[key] !== undefined).length
  );
}

export const searchService = {
  search: (params: TenderSearchParams, signal?: AbortSignal) => searchAdapter.searchTenders(normalizeSearchParams(params), signal),
  getTender: (id: string, signal?: AbortSignal) => searchAdapter.getTender(id, signal),
  suggest: (q: string, limit?: number, signal?: AbortSignal) => searchAdapter.getSuggestions(q.trim(), limit, signal),
};
