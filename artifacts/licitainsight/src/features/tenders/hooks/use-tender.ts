import { queryOptions, useQuery } from '@tanstack/react-query';
import { isApiError } from '@/api';
import { queryKeys } from '@/services/query-keys';
import { searchService } from '@/services/search-service';

/** Poll while the PNCP details are pending, then back off to one request every 30 seconds. */
const pendingPollDelay = (attempt: number) => Math.min(2_000 * 2 ** Math.max(0, attempt), 30_000);

/** Query options for one tender detail (`useTender`). Saved tenders come from `/me/saved-tenders` and no longer reuse this. */
export const tenderQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.tenders.detail(id),
    queryFn: ({ signal }) => searchService.getTender(id, signal),
    staleTime: 60_000,
    refetchInterval: (query) => (query.state.data?.source.id === 'pncp' && query.state.data.detailsFetchedAt === null
      ? pendingPollDelay(query.state.dataUpdateCount - 1)
      : false),
    retry: (failureCount, error) => isApiError(error) && error.isTransient && failureCount < 2,
  });

export function useTender(id: string | undefined) {
  return useQuery({ ...tenderQuery(id ?? ''), enabled: Boolean(id) });
}
