import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { isApiError, type OpportunitySearchParams } from '@/api';
import { queryKeys } from '@/services/query-keys';
import { opportunityParamsFromUrl, opportunityService } from '@/services/opportunity-service';

export function useOpportunitySearch(params: OpportunitySearchParams) {
  return useQuery({
    queryKey: queryKeys.opportunities.search(params),
    queryFn: ({ signal }) => opportunityService.search(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: (failureCount, error) => isApiError(error) && error.isTransient && failureCount < 2,
  });
}

export function useOpportunity(id: string) {
  return useQuery({
    queryKey: queryKeys.opportunities.detail(id),
    queryFn: ({ signal }) => opportunityService.get(id, signal),
    retry: (failureCount, error) => isApiError(error) && error.isTransient && failureCount < 2,
    enabled: id.length > 0,
  });
}

export { opportunityParamsFromUrl };
