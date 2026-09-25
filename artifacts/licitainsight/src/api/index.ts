import type { AccountAdapter } from './adapters/account-adapter';
import type { AiAdapter } from './adapters/ai-adapter';
import type { OpportunityAdapter } from './adapters/opportunity-adapter';
import type { SearchAdapter } from './adapters/search-adapter';
import { httpAccountAdapter } from './adapters/http/http-account-adapter';
import { httpAiAdapter } from './adapters/http/http-ai-adapter';
import { httpOpportunityAdapter } from './adapters/http/http-opportunity-adapter';
import { httpSearchAdapter } from './adapters/http/http-search-adapter';

/** Search, detail and suggestions always read the PostgreSQL-backed API. */
export const searchAdapter: SearchAdapter = httpSearchAdapter;

/** Cultural calls from Mapas Culturais. Separate from PNCP tenders. */
export const opportunityAdapter: OpportunityAdapter = httpOpportunityAdapter;

/** Session, saved tenders, saved searches and notifications of the signed-in user. */
export const accountAdapter: AccountAdapter = httpAccountAdapter;

/** "Perguntar ao edital": official passages selected by Jev on the server. The key never reaches the browser. */
export const aiAdapter: AiAdapter = httpAiAdapter;

export * from './types';
export { ApiError, isApiError } from './errors';
