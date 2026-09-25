import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AskTenderResult, TenderAskStatus } from '@/api';
import { aiService } from '@/services/ai-service';
import { queryKeys } from '@/services/query-keys';

const INDEXING = new Set<TenderAskStatus['index']>(['not_started', 'processing']);

/** 2 s, 4 s, 8 s, then every 10 s while the documents are being read. */
const pollDelay = (attempt: number) => Math.min(2_000 * 2 ** attempt, 10_000);

/**
 * Index state and quota. Only enabled for users with access: for them the GET also starts the indexing
 * (and retries a failed one), so calling it without access would read a state that never moves.
 */
export function useAskStatus(tenderId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.me.askStatus(tenderId),
    queryFn: ({ signal }) => aiService.getAskStatus(tenderId, signal),
    enabled,
    refetchInterval: (query) => (query.state.data && INDEXING.has(query.state.data.index) ? pollDelay(query.state.dataUpdateCount - 1) : false),
    refetchOnWindowFocus: false,
  });
}

/** One question. The answer carries the new quota, which is written back into the status cache. */
export function useAskTender(tenderId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.me.askStatus(tenderId);
  return useMutation({
    mutationFn: (question: string) => aiService.ask(tenderId, question),
    onSuccess: (result: AskTenderResult) => {
      queryClient.setQueryData<TenderAskStatus>(key, (status) => (status ? { ...status, quota: result.quota } : status));
      // The index was not ready after all: poll the status again until it is.
      if (result.status === 'processing') void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error) => {
      console.error('[perguntar] Falha ao perguntar ao edital.', error);
      // Quota or access changed on the server: the status shows the current numbers.
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
