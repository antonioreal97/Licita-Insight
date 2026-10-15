import type { SearchAdapter } from '../search-adapter';
import type { OpenTendersByStateResponse, SuggestionsResponse, TenderDetail, TenderSearchResponse } from '../../types';
import { getJson } from './http-client';

/** Talks to the real backend (CODEX_BACKEND_AGENT) — contract: docs/contracts/search-v1.md. */
export const httpSearchAdapter: SearchAdapter = {
  searchTenders: (params, signal) => getJson<TenderSearchResponse>('/v1/tenders/search', params, signal),
  getTender: (id, signal) => getJson<TenderDetail>(`/v1/tenders/${encodeURIComponent(id)}`, {}, signal),
  getSuggestions: (q, limit = 8, signal) => getJson<SuggestionsResponse>('/v1/search/suggestions', { q, limit }, signal),
  getOpenTendersByState: (signal) => getJson<OpenTendersByStateResponse>('/v1/public/tenders/by-state', {}, signal),
};
