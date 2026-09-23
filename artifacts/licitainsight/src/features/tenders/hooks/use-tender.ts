import { queryOptions, useQuery } from '@tanstack/react-query';
import { isApiError } from '@/api';
import { queryKeys } from '@/services/query-keys';
import { searchService } from '@/services/search-service';

/** Shared by the detail page and the saved-tenders list (one detail request per saved id). */
export const tenderQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.tenders.detail(id),
    queryFn: ({ signal }) => searchService.getTender(id, signal),
    staleTime: 60_000,
    retry: (failureCount, error) => isApiError(error) && error.isTransient && failureCount < 2,
  });

export function useTender(id: string | undefined) {
  return useQuery({ ...tenderQuery(id ?? ''), enabled: Boolean(id) });
}
