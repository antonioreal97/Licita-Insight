import type { SuggestionsResponse, TenderDetail, TenderSearchParams, TenderSearchResponse } from '../types';

/**
 * The only boundary between the frontend and the backend for search.
 * Implementation: HttpSearchAdapter (`/api/v1`), which reads PostgreSQL.
 * Components never import an adapter — they go through services and hooks.
 */
export interface SearchAdapter {
  searchTenders(params: TenderSearchParams, signal?: AbortSignal): Promise<TenderSearchResponse>;
  getTender(id: string, signal?: AbortSignal): Promise<TenderDetail>;
  getSuggestions(q: string, limit?: number, signal?: AbortSignal): Promise<SuggestionsResponse>;
}
