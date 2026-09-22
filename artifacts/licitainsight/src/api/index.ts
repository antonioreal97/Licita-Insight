import type { SearchAdapter } from './adapters/search-adapter';
import { httpSearchAdapter } from './adapters/http/http-search-adapter';

/** Search, detail and suggestions always read the PostgreSQL-backed API. */
export const searchAdapter: SearchAdapter = httpSearchAdapter;

export * from './types';
export { ApiError, isApiError } from './errors';
