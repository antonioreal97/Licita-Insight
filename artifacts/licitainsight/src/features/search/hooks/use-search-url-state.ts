import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import type { TenderSearchParams } from '@/api';
import { resultsViewFromUrl, searchParamsFromUrl, searchParamsToUrl, type ResultsView } from '@/services/search-service';
import { searchDefaultsToUrl, withoutFilters, withSearchDefaults } from '../lib/search-defaults';

const toUrl = (params: TenderSearchParams, view: ResultsView) => searchParamsToUrl(searchDefaultsToUrl(params), view);

/**
 * Search state lives in the URL: shareable links, working back/forward, and a single source of truth.
 * `update` merges a patch; any change other than `page` resets to page 1. The results view (`view=table`) rides along.
 * No `status` in the URL means the default (open tenders); "Todos os status" is `status=all` (see search-defaults).
 */
export function useSearchUrlState() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo<TenderSearchParams>(() => withSearchDefaults(searchParamsFromUrl(search), search), [search]);
  const view = resultsViewFromUrl(search);

  // Invalid or non-canonical values (`?status=bogus`, `?page=-1`, `?mode=semantic` while off) are dropped by the parser; drop them from the URL too.
  useEffect(() => {
    const canonical = toUrl(params, view);
    if (canonical !== (search ? `?${search}` : '')) navigate(`/search${canonical}`, { replace: true });
  }, [params, view, search, navigate]);

  const replaceAll = useCallback(
    (next: TenderSearchParams, opts: { replace?: boolean; view?: ResultsView } = {}) => {
      navigate(`/search${toUrl(next, opts.view ?? view)}`, { replace: opts.replace });
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

  const clearFilters = useCallback(() => replaceAll(withoutFilters(params)), [params, replaceAll]);

  return { params, view, setView, update, replaceAll, clearFilters };
}
