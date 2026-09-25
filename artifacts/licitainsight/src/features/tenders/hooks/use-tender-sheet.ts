import { useQuery } from '@tanstack/react-query';
import type { TenderSheet } from '@/api';
import { aiService } from '@/services/ai-service';
import { queryKeys } from '@/services/query-keys';

const BUILDING = new Set<TenderSheet['status']>(['not_started', 'processing']);

/** 2 s, 4 s, 8 s, then every 10 s while the documents are read and the sheet is built. */
const pollDelay = (attempt: number) => Math.min(2_000 * 2 ** attempt, 10_000);

/** Only for accounts with access: for them the GET also starts building the sheet. */
export function useTenderSheet(tenderId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.me.tenderSheet(tenderId),
    queryFn: ({ signal }) => aiService.getTenderSheet(tenderId, signal),
    enabled,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (query.state.data && BUILDING.has(query.state.data.status) ? pollDelay(query.state.dataUpdateCount - 1) : false),
  });
}
