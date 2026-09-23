import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import type { OpportunitySearchParams } from '@/api';
import { opportunityParamsFromUrl, opportunityParamsToUrl } from '@/services/opportunity-service';

export function useOpportunityUrlState() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => opportunityParamsFromUrl(search), [search]);

  useEffect(() => {
    const canonical = opportunityParamsToUrl(params);
    if (canonical !== (search ? `?${search}` : '')) navigate(`/oportunidades${canonical}`, { replace: true });
  }, [params, search, navigate]);

  const update = useCallback(
    (patch: Partial<OpportunitySearchParams>) => {
      const resetsPage = Object.keys(patch).some((key) => key !== 'page');
      const next = { ...params, ...patch, ...(resetsPage ? { page: undefined } : {}) };
      navigate(`/oportunidades${opportunityParamsToUrl(next)}`);
    },
    [navigate, params],
  );

  return { params, update };
}
