import { useCallback, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import type { TenderSearchParams } from '@/api';
import { searchParamsFromUrl, searchParamsToUrl } from '@/services/search-service';

/** QA-only params that must survive navigation (see mock-search-adapter). */
const PRESERVED_KEYS = ['mock'];

/**
 * Search state lives in the URL: shareable links, working back/forward, and a single source of truth.
 * `update` merges a patch; any change other than `page` resets to page 1.
 */
export function useSearchUrlState() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => searchParamsFromUrl(search), [search]);

  const replaceAll = useCallback(
    (next: TenderSearchParams, opts: { replace?: boolean } = {}) => {
      const current = new URLSearchParams(search);
      const target = new URLSearchParams(searchParamsToUrl(next));
      for (const key of PRESERVED_KEYS) {
        const value = current.get(key);
        if (value) target.set(key, value);
      }
      const text = target.toString();
      navigate(`/search${text ? `?${text}` : ''}`, { replace: opts.replace });
    },
    [navigate, search],
  );

  const update = useCallback(
    (patch: Partial<TenderSearchParams>, opts: { replace?: boolean } = {}) => {
      const resetsPage = Object.keys(patch).some((key) => key !== 'page');
      replaceAll({ ...params, ...patch, ...(resetsPage ? { page: 1 } : {}) }, opts);
    },
    [params, replaceAll],
  );

  const clearFilters = useCallback(() => replaceAll({ q: params.q, sort: params.sort }), [params.q, params.sort, replaceAll]);

  return { params, update, replaceAll, clearFilters };
}
