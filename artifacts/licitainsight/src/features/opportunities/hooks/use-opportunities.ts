import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError, type OpportunitySearchParams } from '@/api';
import { useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { queryKeys } from '@/services/query-keys';
import { opportunityParamsFromUrl, opportunityService } from '@/services/opportunity-service';

export type OpportunityAccess =
  { state: 'loading' } | { state: 'error'; error: unknown; retry: () => void } | { state: 'anonymous' | 'no-access' | 'entitled' };

/** Cultural calls need access (active trial or subscription). Decided from session + billing, before any /opportunities request. */
export function useOpportunityAccess(): OpportunityAccess {
  const session = useSession();
  const billing = useBilling();
  const queryClient = useQueryClient();
  if (session.status === 'anonymous') return { state: 'anonymous' };
  if (session.status === 'loading') {
    if (!session.error) return { state: 'loading' };
    return { state: 'error', error: session.error, retry: () => void queryClient.refetchQueries({ queryKey: queryKeys.session }) };
  }
  if (billing.isError) return { state: 'error', error: billing.error, retry: () => void billing.refetch() };
  if (billing.isPending) return { state: 'loading' };
  return { state: billing.data.entitled ? 'entitled' : 'no-access' };
}

/** The API is the source of truth: 401 → signed out, 402 `SUBSCRIPTION_REQUIRED` → no access. */
export function deniedAccess(error: unknown): 'anonymous' | 'no-access' | null {
  if (!isApiError(error)) return null;
  if (error.status === 401) return 'anonymous';
  if (error.status === 402) return 'no-access';
  return null;
}

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
