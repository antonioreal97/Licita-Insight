import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import type { TenderSearchParams } from '@/api';
import { resultsViewFromUrl, searchParamsFromUrl, searchParamsToUrl, type ResultsView } from '@/services/search-service';

/**
 * Search state lives in the URL: shareable links, working back/forward, and a single source of truth.
 * `update` merges a patch; any change other than `page` resets to page 1. The results view (`view=table`) rides along.
 */
export function useSearchUrlState() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo<TenderSearchParams>(() => searchParamsFromUrl(search), [search]);
  const view = resultsViewFromUrl(search);

  // Invalid or non-canonical values (`?status=bogus`, `?page=-1`) are dropped by the parser; drop them from the URL too.
  useEffect(() => {
    const canonical = searchParamsToUrl(params, view);
    if (canonical !== (search ? `?${search}` : '')) navigate(`/search${canonical}`, { replace: true });
  }, [params, view, search, navigate]);

  const replaceAll = useCallback(
    (next: TenderSearchParams, opts: { replace?: boolean; view?: ResultsView } = {}) => {
      navigate(`/search${searchParamsToUrl(next, opts.view ?? view)}`, { replace: opts.replace });
    },
    [navigate, view],
  );

  const update = useCallback(
    (patch: Partial<TenderSearchParams>, opts: { replace?: boolean } = {}) => {
      const resetsPage = Object.keys(patch).some((key) => key !== 'page');
      replaceAll({ ...params, ...patch, ...(resetsPage ? { page: 1 } : {}) }, opts);
    },
    [params, replaceAll],
  );

  const setView = useCallback((next: ResultsView) => replaceAll(params, { view: next }), [params, replaceAll]);

  /** Drops every filter but keeps the query, sort, search mode and page size. */
  const clearFilters = useCallback(
    () => replaceAll({ q: params.q, sort: params.sort, mode: params.mode, pageSize: params.pageSize }),
    [params.q, params.sort, params.mode, params.pageSize, replaceAll],
  );

  return { params, view, setView, update, replaceAll, clearFilters };
}
