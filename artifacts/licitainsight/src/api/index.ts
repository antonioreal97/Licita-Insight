import type { SearchAdapter } from './adapters/search-adapter';
import { httpSearchAdapter } from './adapters/http/http-search-adapter';
import { mockSearchAdapter } from './adapters/mock/mock-search-adapter';

/**
 * Adapter selection. `VITE_API_MODE=http` switches to the real backend; anything else uses mocks.
 * Swapping adapters must never require touching services, hooks or components.
 */
export const apiMode: 'mock' | 'http' = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock';

export const searchAdapter: SearchAdapter = apiMode === 'http' ? httpSearchAdapter : mockSearchAdapter;

export * from './types';
export { ApiError, isApiError } from './errors';
