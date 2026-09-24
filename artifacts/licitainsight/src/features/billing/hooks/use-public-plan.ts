import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { isApiError } from '@/api';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';

/**
 * Public `GET /api/v1/billing/plan`: single plan price and trial length (no session needed).
 * `monthlyBrl` is `null` when the price is not configured — show no price then, never a made-up one.
 * A 404 means this API predates CODEX_HANDOFF-007: the query errors and callers hide the price.
 */
export function usePublicPlan(): UseQueryResult<{ monthlyBrl: number | null; trialDays: number; currency: 'BRL' }> {
  return useQuery({
    queryKey: queryKeys.billingPlan,
    queryFn: ({ signal }) => accountService.getPublicPlan(signal),
    staleTime: 10 * 60_000,
    retry: (failureCount, error) => isApiError(error) && error.isTransient && failureCount < 2,
  });
}
