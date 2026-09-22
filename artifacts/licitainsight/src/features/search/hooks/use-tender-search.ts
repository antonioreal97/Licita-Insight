import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { isApiError, type TenderSearchParams } from '@/api';
import { queryKeys } from '@/services/query-keys';
import { normalizeSearchParams, searchService } from '@/services/search-service';

export function useTenderSearch(params: TenderSearchParams, options: { enabled?: boolean } = {}) {
  const normalized = normalizeSearchParams(params);
  return useQuery({
    queryKey: queryKeys.tenders.search(normalized),
    queryFn: ({ signal }) => searchService.search(normalized, signal),
    // Keep the previous page on screen while the next one loads (no layout jump on filter/page change).
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: (failureCount, error) => isApiError(error) && error.isTransient && failureCount < 2,
    enabled: options.enabled ?? true,
  });
}
