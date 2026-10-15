import { useQuery } from '@tanstack/react-query';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { aiService } from '@/services/ai-service';
import { scopedMeQueryKeys } from '@/services/query-keys';
import { useActiveWorkspaceId } from '@/features/workspaces/workspace-scope';

/**
 * Requirement highlights of a result page (same access as the tender sheet). The API only reads sheets that are
 * already ready, so this never starts an analysis; without access or data the rows simply show no highlights.
 */
export function useTenderHighlights(tenderIds: string[]) {
  const billing = useBilling();
  const workspaceId = useActiveWorkspaceId();
  const enabled = tenderIds.length > 0 && billing.data?.entitled === true;
  return useQuery({
    queryKey: scopedMeQueryKeys(workspaceId).tenderHighlights(tenderIds),
    queryFn: ({ signal }) => aiService.getTenderHighlights(tenderIds, signal),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
