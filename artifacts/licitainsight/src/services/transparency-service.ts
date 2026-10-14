import {
  type AwardHistoryResponse,
  type TransparencyContractSearchParams,
  type TransparencyContractSort,
  type TransparencyContractsResponse,
  type TransparencyTenderContractsResponse,
  type TransparencyTenderResultsResponse,
} from '@/api';
import { getJson } from '@/api/adapters/http/http-client';
import { isCalendarDate, MAX_MONEY } from './search-service';

const SORTS: TransparencyContractSort[] = ['published_desc', 'published_asc', 'value_desc', 'value_asc'];
const UFS = new Set('AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' '));

export const DEFAULT_TRANSPARENCY_PAGE_SIZE = 12;

const cleanText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : undefined;
};

const cleanMoney = (value?: number) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_MONEY ? value : undefined);

export function normalizeTransparencyParams(params: TransparencyContractSearchParams): TransparencyContractSearchParams {
  const out: TransparencyContractSearchParams = {};
  const q = cleanText(params.q);
  const state = cleanText(params.state)?.toUpperCase();
  if (q) out.q = q;
  if (state && UFS.has(state)) out.state = state;
  if (params.publishedFrom && isCalendarDate(params.publishedFrom)) out.publishedFrom = params.publishedFrom;
  if (params.publishedTo && isCalendarDate(params.publishedTo)) out.publishedTo = params.publishedTo;
  const valueMin = cleanMoney(params.valueMin);
  const valueMax = cleanMoney(params.valueMax);
  if (valueMin !== undefined) out.valueMin = valueMin;
  if (valueMax !== undefined) out.valueMax = valueMax;
  if (params.sort && params.sort !== 'published_desc' && SORTS.includes(params.sort)) out.sort = params.sort;
  if (params.page && Number.isSafeInteger(params.page) && params.page > 1) out.page = params.page;
  out.pageSize = params.pageSize && Number.isSafeInteger(params.pageSize)
    ? Math.min(50, Math.max(1, params.pageSize))
    : DEFAULT_TRANSPARENCY_PAGE_SIZE;
  return out;
}

export function transparencyParamsFromUrl(search: string): TransparencyContractSearchParams {
  const url = new URLSearchParams(search);
  const params: TransparencyContractSearchParams = {};
  const q = url.get('q');
  const state = url.get('state');
  const publishedFrom = url.get('publishedFrom');
  const publishedTo = url.get('publishedTo');
  if (q) params.q = q;
  if (state) params.state = state;
  if (publishedFrom) params.publishedFrom = publishedFrom;
  if (publishedTo) params.publishedTo = publishedTo;
  for (const key of ['valueMin', 'valueMax'] as const) {
    const raw = url.get(key);
    const value = Number(raw);
    if (raw && Number.isFinite(value)) params[key] = value;
  }
  const page = Number(url.get('page'));
  if (Number.isInteger(page) && page > 1) params.page = page;
  const sort = url.get('sort') as TransparencyContractSort | null;
  if (sort && SORTS.includes(sort)) params.sort = sort;
  const pageSize = Number(url.get('pageSize'));
  if (Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 50) params.pageSize = pageSize;
  return normalizeTransparencyParams(params);
}

export function transparencyParamsToUrl(params: TransparencyContractSearchParams): string {
  const { pageSize, ...rest } = normalizeTransparencyParams(params);
  const url = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) url.set(key, String(value));
  }
  if (pageSize !== DEFAULT_TRANSPARENCY_PAGE_SIZE) url.set('pageSize', String(pageSize));
  const text = url.toString();
  return text ? `?${text}` : '';
}

export const transparencyService = {
  searchContracts: (params: TransparencyContractSearchParams, signal?: AbortSignal) =>
    getJson<TransparencyContractsResponse>('/v1/transparency/contracts', normalizeTransparencyParams(params), signal),
  getTenderContracts: (tenderId: string, signal?: AbortSignal) =>
    getJson<TransparencyTenderContractsResponse>(`/v1/tenders/${encodeURIComponent(tenderId)}/transparency/contracts`, {}, signal),
  getTenderResults: (tenderId: string, signal?: AbortSignal) =>
    getJson<TransparencyTenderResultsResponse>(`/v1/tenders/${encodeURIComponent(tenderId)}/transparency/results`, {}, signal),
  getTenderAwardHistory: (tenderId: string, signal?: AbortSignal) =>
    getJson<AwardHistoryResponse>(`/v1/tenders/${encodeURIComponent(tenderId)}/award-history`, {}, signal),
};
