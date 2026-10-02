import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import type { TenderSearchParams } from '@/api';
import { resultsViewFromUrl, searchParamsFromUrl, searchParamsToUrl, type ResultsView } from '@/services/search-service';
import { searchDefaultsToUrl, withoutFilters, withSearchDefaults } from '../lib/search-defaults';
import { readRememberedSearch, rememberSearch } from '../lib/search-navigation-state';

const toUrl = (params: TenderSearchParams, view: ResultsView) => searchParamsToUrl(searchDefaultsToUrl(params), view);

/**
 * Search state lives in the URL: shareable links, working back/forward, and a single source of truth.
 * The latest canonical URL is remembered for this browser tab, so opening bare `/search` restores the navigation state.
 * `update` merges a patch; any change other than `page` resets to page 1. The results view (`view=table`) rides along.
 * No `status` in the URL means the default (open tenders); "Todos os status" is `status=all` (see search-defaults).
 */
export function useSearchUrlState() {
  const search = useSearch();
  const [, navigate] = useLocation();
  // An explicit URL always wins (shared links and saved searches); only a bare /search restores the last navigation.
  const rememberedSearch = useMemo(() => (search ? '' : readRememberedSearch()), [search]);
  const stateSearch = search || rememberedSearch;
  const params = useMemo<TenderSearchParams>(() => withSearchDefaults(searchParamsFromUrl(stateSearch), stateSearch), [stateSearch]);
  const view = resultsViewFromUrl(stateSearch);

  // Invalid or non-canonical values are dropped by the parser. This also puts a remembered search back in the address bar.
  useEffect(() => {
    const canonical = toUrl(params, view);
    if (canonical !== (search ? `?${search}` : '')) {
      navigate(`/search${canonical}`, { replace: true });
      return;
    }
    rememberSearch(canonical);
  }, [params, view, search, navigate]);

  const replaceAll = useCallback(
    (next: TenderSearchParams, opts: { replace?: boolean; view?: ResultsView } = {}) => {
      const canonical = toUrl(next, opts.view ?? view);
      rememberSearch(canonical);
      navigate(`/search${canonical}`, { replace: opts.replace });
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
