import { useQuery } from '@tanstack/react-query';
import { isApiError } from '@/api';
import { queryKeys } from '@/services/query-keys';
import { searchService } from '@/services/search-service';

export function useTender(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tenders.detail(id ?? ''),
    queryFn: ({ signal }) => searchService.getTender(id!, signal),
    enabled: Boolean(id),
    staleTime: 60_000,
    retry: (failureCount, error) => isApiError(error) && error.isTransient && failureCount < 2,
  });
}
