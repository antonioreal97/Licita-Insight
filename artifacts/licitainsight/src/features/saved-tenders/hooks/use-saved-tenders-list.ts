import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SavedTender, SavedTendersParams } from '@/api';
import { useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { accountService, MAX_SAVED_TENDERS_PAGE_SIZE } from '@/services/account-service';
import { scopedMeQueryKeys } from '@/services/query-keys';
import { useActiveWorkspaceId } from '@/features/workspaces/workspace-scope';

/**
 * Server-paginated saved tenders (`savedAt desc`, or nearest deadline with `sort: 'deadline'`). `monitored: true` / `stage`
 * filter on the server. Disabled while signed out.
 */
export function useSavedTendersList({ page, pageSize, monitored, stage, sort, upcoming }: SavedTendersParams) {
  const { status } = useSession();
  const billing = useBilling();
  const workspaceId = useActiveWorkspaceId();
  const params: SavedTendersParams = { page, pageSize, monitored, stage, sort, upcoming };
  return useQuery({
    queryKey: scopedMeQueryKeys(workspaceId).savedTenders.list(params),
    queryFn: ({ signal }) => accountService.listSavedTenders(params, signal),
    enabled: status === 'authenticated' && billing.data?.entitled === true,
    placeholderData: keepPreviousData,
  });
}

/** Every saved tender, page by page (the account holds ≤ 500, so ≤ 5 requests). For the CSV export. */
export async function fetchAllSavedTenders(): Promise<SavedTender[]> {
  const all: SavedTender[] = [];
  for (let page = 1; ; page++) {
    const response = await accountService.listSavedTenders({ page, pageSize: MAX_SAVED_TENDERS_PAGE_SIZE });
    all.push(...response.data);
    if (page >= response.pagination.totalPages) return all;
  }
}
