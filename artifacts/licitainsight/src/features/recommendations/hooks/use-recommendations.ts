import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';
import { trackRecommendationAction } from '@/features/analytics/google-analytics';

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
  return useQuery({
    queryKey: [...queryKeys.me.recommendations, pageSize],
    queryFn: ({ signal }) => accountService.listRecommendations({ page: 1, pageSize }, signal),
    enabled: session.status === 'authenticated' && billing.data?.entitled === true,
  });
}

export function useUpdateRecommendationPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ enabled, deleteHistory }: { enabled: boolean; deleteHistory?: boolean }) =>
      accountService.updateRecommendationPreferences(enabled, deleteHistory),
    onSuccess: (data) => {
      client.setQueryData(queryKeys.me.recommendationPreferences, data);
      void client.invalidateQueries({ queryKey: queryKeys.me.recommendations });
    },
  });
}

export function useDeleteRecommendationHistory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => accountService.deleteRecommendationHistory(),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.me.recommendations }),
  });
}

export function useDismissRecommendation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (tenderId: string) => accountService.dismissRecommendation(tenderId),
    onSuccess: () => {
      trackRecommendationAction('recommendation_dismiss');
      void client.invalidateQueries({ queryKey: queryKeys.me.recommendations });
    },
  });
}
