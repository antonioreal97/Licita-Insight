import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { accountService } from '@/services/account-service';
import { queryKeys, scopedMeQueryKeys } from '@/services/query-keys';
import { trackRecommendationAction } from '@/features/analytics/google-analytics';
import { useActiveWorkspaceId } from '@/features/workspaces/workspace-scope';

export function useRecommendationPreferences() {
  const session = useSession();
  return useQuery({
    queryKey: queryKeys.me.recommendationPreferences,
    queryFn: ({ signal }) => accountService.getRecommendationPreferences(signal),
    enabled: session.status === 'authenticated',
  });
}

export function useRecommendations(pageSize = 8) {
  const session = useSession();
  const billing = useBilling();
  const workspaceId = useActiveWorkspaceId();
  return useQuery({
    queryKey: [...scopedMeQueryKeys(workspaceId).recommendations, pageSize],
    queryFn: ({ signal }) => accountService.listRecommendations({ page: 1, pageSize }, signal),
    enabled: session.status === 'authenticated' && billing.data?.entitled === true,
  });
}

export function useUpdateRecommendationPreferences() {
  const client = useQueryClient();
  const workspaceId = useActiveWorkspaceId();
  const recommendationsKey = scopedMeQueryKeys(workspaceId).recommendations;
  return useMutation({
    mutationFn: ({
      enabled,
      deleteHistory,
      showInternationalOpportunities,
    }: {
      enabled: boolean;
      deleteHistory?: boolean;
      showInternationalOpportunities?: boolean;
    }) => accountService.updateRecommendationPreferences(enabled, deleteHistory, showInternationalOpportunities),
    onSuccess: (data) => {
      client.setQueryData(queryKeys.me.recommendationPreferences, data);
      void client.invalidateQueries({ queryKey: recommendationsKey });
      // Profile matching of international calls follows the preference.
      void client.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    },
  });
}

export function useDeleteRecommendationHistory() {
  const client = useQueryClient();
  const workspaceId = useActiveWorkspaceId();
  const recommendationsKey = scopedMeQueryKeys(workspaceId).recommendations;
  return useMutation({
    mutationFn: () => accountService.deleteRecommendationHistory(),
    onSuccess: () => void client.invalidateQueries({ queryKey: recommendationsKey }),
  });
}

export function useDismissRecommendation() {
  const client = useQueryClient();
  const workspaceId = useActiveWorkspaceId();
  const recommendationsKey = scopedMeQueryKeys(workspaceId).recommendations;
  return useMutation({
    mutationFn: (tenderId: string) => accountService.dismissRecommendation(tenderId),
    onSuccess: () => {
      trackRecommendationAction('recommendation_dismiss');
      void client.invalidateQueries({ queryKey: recommendationsKey });
    },
  });
}
