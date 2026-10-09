import { useQuery } from '@tanstack/react-query';
import { isApiError } from '@/api';
import { queryKeys } from '@/services/query-keys';
import { searchService } from '@/services/search-service';

/**
 * Public `GET /api/v1/public/tenders/by-state`: open tenders and estimated value per state (no session needed).
 * The server recomputes it every 15 minutes, so the browser does not ask again before that.
 */
export function useOpenTendersByState() {
  return useQuery({
    queryKey: queryKeys.tenders.openByState,
    queryFn: ({ signal }) => searchService.openTendersByState(signal),
    staleTime: 15 * 60_000,
    retry: (failureCount, error) => isApiError(error) && error.isTransient && failureCount < 2,
  });
}
