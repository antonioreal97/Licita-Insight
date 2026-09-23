import { searchAdapter, type Modality, type SearchMode, type SortOption, type TenderSearchParams, type TenderStatus } from '@/api';

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

// The 27 federative units (26 states + DF).
const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
];

/** Upper bound for value filters (R$ 999.999.999.999): larger inputs are typos and would serialize as `1e+23`. */
export const MAX_MONEY = 999_999_999_999;

/** `YYYY-MM-DD` that exists on the calendar (rejects `2026-13-40`, `2026-02-30`). */
export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Results layout. Lives in the URL next to the filters (`view=table`); list is the default and is omitted. */
export type ResultsView = 'list' | 'table';
export const resultsViewFromUrl = (search: string): ResultsView => (new URLSearchParams(search).get('view') === 'table' ? 'table' : 'list');

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
  params.state = params.state?.map((uf) => uf.toUpperCase()).filter((uf) => UFS.includes(uf));
  for (const key of NUMBER_KEYS) {
    const value = Number(url.get(key));
    if (url.get(key) && Number.isFinite(value) && value >= 0 && value <= MAX_MONEY) params[key] = value;
  }
  for (const key of DATE_KEYS) {
    const value = url.get(key);
    if (value && isCalendarDate(value)) params[key] = value;
  }
  const sort = url.get('sort') as SortOption | null;
  if (sort && SORTS.includes(sort)) params.sort = sort;
  const page = Number(url.get('page'));
  if (Number.isInteger(page) && page > 1) params.page = page;
  const pageSize = Number(url.get('pageSize'));
  if (Number.isInteger(pageSize) && pageSize > 0) params.pageSize = pageSize;
  const mode = searchModeFromUrl(search);
  if (mode) params.mode = mode;
  return normalizeSearchParams(params);
}

export function searchParamsToUrl(params: TenderSearchParams, view: ResultsView = 'list'): string {
  const { pageSize, facets: _facets, ...rest } = normalizeSearchParams(params);
  const url = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (Array.isArray(value)) value.forEach((item) => url.append(key, String(item)));
    else if (value !== undefined) url.set(key, String(value));
  }
  if (pageSize !== DEFAULT_PAGE_SIZE) url.set('pageSize', String(pageSize));
  if (view === 'table') url.set('view', 'table');
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

const SEARCH_MODES: SearchMode[] = ['keyword', 'semantic', 'hybrid'];

/** Returns `undefined` for keyword/unknown so normalized params stay canonical. */
export function searchModeFromUrl(search: string): SearchMode | undefined {
  const mode = new URLSearchParams(search).get('mode') as SearchMode | null;
  return mode && mode !== 'keyword' && SEARCH_MODES.includes(mode) ? mode : undefined;
}

export const searchService = {
  search: (params: TenderSearchParams, signal?: AbortSignal) => searchAdapter.searchTenders(normalizeSearchParams(params), signal),
  getTender: (id: string, signal?: AbortSignal) => searchAdapter.getTender(id, signal),
  suggest: (q: string, limit?: number, signal?: AbortSignal) => searchAdapter.getSuggestions(q.trim(), limit, signal),
};
