import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SavedTender, SavedTendersParams } from '@/api';
import { useSession } from '@/features/auth/hooks/use-session';
import { accountService, MAX_SAVED_TENDERS_PAGE_SIZE } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';

/** Server-paginated saved tenders (`savedAt desc`). `monitored: true` lists only monitored ones. Disabled while signed out. */
export function useSavedTendersList({ page, pageSize, monitored }: SavedTendersParams) {
  const { status } = useSession();
  const params: SavedTendersParams = { page, pageSize, monitored };
  return useQuery({
    queryKey: queryKeys.me.savedTenders.list(params),
    queryFn: ({ signal }) => accountService.listSavedTenders(params, signal),
    enabled: status === 'authenticated',
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
