import type { AccountAdapter } from './adapters/account-adapter';
import type { SearchAdapter } from './adapters/search-adapter';
import { httpAccountAdapter } from './adapters/http/http-account-adapter';
import { httpSearchAdapter } from './adapters/http/http-search-adapter';

/** Search, detail and suggestions always read the PostgreSQL-backed API. */
export const searchAdapter: SearchAdapter = httpSearchAdapter;

/** Session, saved tenders, saved searches and notifications of the signed-in user. */
export const accountAdapter: AccountAdapter = httpAccountAdapter;

export * from './types';
export { ApiError, isApiError } from './errors';
