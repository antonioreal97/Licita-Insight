import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountUsageProfilePatch } from '@/api';
import { useSession } from '@/features/auth/hooks/use-session';
import { accountService } from '@/services/account-service';
import { queryKeys, scopedMeQueryKeys } from '@/services/query-keys';
import { useActiveWorkspaceId } from '@/features/workspaces/workspace-scope';

export function useUsageProfile() {
  const { status } = useSession();
  return useQuery({
    queryKey: queryKeys.me.usageProfile,
    queryFn: ({ signal }) => accountService.getUsageProfile(signal),
    enabled: status === 'authenticated',
  });
}

export function useSaveUsageProfile() {
  const client = useQueryClient();
  const workspaceId = useActiveWorkspaceId();
  return useMutation({
    mutationFn: (body: AccountUsageProfilePatch) => accountService.updateUsageProfile(body),
    onSuccess: (saved) => {
      client.setQueryData(queryKeys.me.usageProfile, saved);
      void client.invalidateQueries({ queryKey: scopedMeQueryKeys(workspaceId).recommendations });
    },
  });
}
