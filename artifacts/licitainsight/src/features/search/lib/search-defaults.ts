import type { TenderSearchParams, TenderStatus } from '@/api';

/**
 * Semantic search needs embeddings on the backend, which it does not have yet (`mode=semantic` always falls back to keyword).
 * Off: the mode selector is hidden and `mode` from old links is ignored. Flip once the API serves `meta.searchMode: 'semantic'`.
 */
export const SEARCH_MODE_ENABLED = false;

/** Applied when the URL has no `status`: the search opens on tenders still taking proposals. */
export const DEFAULT_STATUS: TenderStatus[] = ['open'];
/** URL value for "Todos os status", so the choice survives a reload. URL only: the API and saved searches get no `status`. */
const ALL_STATUSES = 'all';

export const isDefaultStatus = (status: TenderStatus[] | undefined) => status?.length === 1 && status[0] === DEFAULT_STATUS[0];

export function withoutDisabledMode(params: TenderSearchParams): TenderSearchParams {
  if (SEARCH_MODE_ENABLED || !params.mode) return params;
  const { mode: _mode, ...rest } = params;
  return rest;
}

/** Search page state from `searchParamsFromUrl` (which drops `status=all`) and the raw query string it came from. */
export function withSearchDefaults(parsed: TenderSearchParams, search: string): TenderSearchParams {
  const params = withoutDisabledMode(parsed);
  if (params.status?.length || new URLSearchParams(search).getAll('status').includes(ALL_STATUSES)) return params;
  return { ...params, status: DEFAULT_STATUS };
}

/** Inverse of `withSearchDefaults`, for `searchParamsToUrl`: the default status is left out, no status is written as `status=all`. */
export function searchDefaultsToUrl(params: TenderSearchParams): TenderSearchParams {
  const { status, ...rest } = params;
  if (isDefaultStatus(status)) return rest;
  return status?.length ? params : { ...rest, status: [ALL_STATUSES as TenderStatus] };
}

const FILTER_KEYS = [
  'modality',
  'state',
  'city',
  'organizationId',
  'sourceId',
  'category',
  'platform',
  'valueMin',
  'valueMax',
  'publishedFrom',
  'publishedTo',
  'deadlineFrom',
  'deadlineTo',
  'newOnly',
] as const;

/** "Limpar filtros": back to the default status, keeping the query, sort, mode and page size. */
export function withoutFilters(params: TenderSearchParams): TenderSearchParams {
  const next: TenderSearchParams = { ...params, status: DEFAULT_STATUS };
  for (const key of FILTER_KEYS) delete next[key];
  delete next.page;
  return next;
}

/** A saved query without `status` covers every status: say so explicitly instead of opening on the default. */
export function savedQueryHref(query: string, options: { newOnly?: boolean } = {}) {
  const params = new URLSearchParams(query);
  if (!params.has('status')) params.append('status', ALL_STATUSES);
  if (options.newOnly) params.set('newOnly', 'true');
  return `/search?${params}`;
}
