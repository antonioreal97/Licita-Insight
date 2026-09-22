import { useCallback, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import type { TenderSearchParams } from '@/api';
import { searchParamsFromUrl, searchParamsToUrl } from '@/services/search-service';

/**
 * Search state lives in the URL: shareable links, working back/forward, and a single source of truth.
 * `update` merges a patch; any change other than `page` resets to page 1.
 */
export function useSearchUrlState() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo<TenderSearchParams>(() => searchParamsFromUrl(search), [search]);

  const replaceAll = useCallback(
    (next: TenderSearchParams, opts: { replace?: boolean } = {}) => {
      const text = searchParamsToUrl(next);
      navigate(`/search${text}`, { replace: opts.replace });
    },
    [navigate],
  );

  const update = useCallback(
    (patch: Partial<TenderSearchParams>, opts: { replace?: boolean } = {}) => {
      const resetsPage = Object.keys(patch).some((key) => key !== 'page');
      replaceAll({ ...params, ...patch, ...(resetsPage ? { page: 1 } : {}) }, opts);
    },
    [params, replaceAll],
  );

  /** Drops every filter but keeps the query, sort, search mode and page size. */
  const clearFilters = useCallback(
    () => replaceAll({ q: params.q, sort: params.sort, mode: params.mode, pageSize: params.pageSize }),
    [params.q, params.sort, params.mode, params.pageSize, replaceAll],
  );

  return { params, update, replaceAll, clearFilters };
}
