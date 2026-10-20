import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { SavedTender, SavedTenderIdsResponse, SavedTendersResponse, SaveTenderBody } from '@/api/types';
import { queryKeys } from '@/services/query-keys';
import { MONITORED_STAGES } from './stages';

/**
 * `previous` is the saved tender before the change, `null` when it is not saved yet: it drives the optimistic state,
 * the toasts and Undo. `remove` only exists to undo a first save.
 */
export type ParticipationChange = { tenderId: string; previous: SavedTender | null; restoreMonitoring?: boolean } & ({ body: SaveTenderBody } | { remove: true });

/** What `applyOptimistic` replaced, so `rollbackOptimistic` can put it back. */
export type OptimisticContext = {
  detail: SavedTender | undefined;
  ids: SavedTenderIdsResponse | undefined;
  /** Paginated lists (`{ data, pagination }`) and the every-page list of the board and calendar (`SavedTender[]`). */
  lists: [QueryKey, unknown][];
};

/** Mirrors the server rule (participation-v1): entering an active stage turns monitoring on, `dismissed` turns it off. */
export function expectedMonitored(saved: SavedTender | null, body: SaveTenderBody) {
  const stage = body.stage ?? saved?.stage ?? 'analyzing';
  const changed = !saved || stage !== saved.stage;
  if (changed && MONITORED_STAGES.includes(stage)) return true;
  if (changed && stage === 'dismissed') return false;
  return body.monitored ?? saved?.monitored ?? false;
}

export function applyBody(saved: SavedTender, body: SaveTenderBody, now = new Date().toISOString()): SavedTender {
  const checklist = new Map(saved.checklist.map((item) => [item.key, item]));
  for (const item of body.checklist ?? []) {
    const note = item.note === undefined ? (checklist.get(item.key)?.note ?? null) : item.note;
    checklist.set(item.key, { key: item.key, state: item.state, note, updatedAt: now });
  }
  const stage = body.stage ?? saved.stage;
  return {
    ...saved,
    // Keep form values stable until success, so a failed request does not remount/erase the draft.
    stage,
    stageAt: stage === saved.stage ? saved.stageAt : now,
    monitored: expectedMonitored(saved, body),
    checklist: [...checklist.values()],
  };
}

export function applyIds(ids: SavedTenderIdsResponse, change: ParticipationChange): SavedTenderIdsResponse {
  const without = (list: string[]) => list.filter((id) => id !== change.tenderId);
  if ('remove' in change) return { saved: without(ids.saved), monitored: without(ids.monitored) };
  const saved = ids.saved.includes(change.tenderId) ? ids.saved : [change.tenderId, ...ids.saved];
  return { saved, monitored: expectedMonitored(change.previous, change.body) ? [...without(ids.monitored), change.tenderId] : without(ids.monitored) };
}

/** Replaces one tender in either list shape; anything else (or a list without it) comes back untouched. */
function replaceInList(data: unknown, tenderId: string, replace: (item: SavedTender) => SavedTender): unknown {
  const map = (items: SavedTender[]) => {
    if (!items.some((item) => item.tender.id === tenderId)) return items;
    return items.map((item) => (item.tender.id === tenderId ? replace(item) : item));
  };
  if (Array.isArray(data)) return map(data as SavedTender[]);
  if (data && typeof data === 'object' && Array.isArray((data as SavedTendersResponse).data)) {
    const response = data as SavedTendersResponse;
    const items = map(response.data);
    return items === response.data ? data : { ...response, data: items };
  }
  return data;
}

const listQueries = (queryClient: QueryClient) => [
  ...queryClient.getQueriesData({ queryKey: queryKeys.me.savedTenders.lists }),
  ...queryClient.getQueriesData({ queryKey: queryKeys.me.savedTenders.everything }),
];

/** Optimistic state of one change: detail, ids and every cached list that holds the tender (list, board, calendar). */
export async function applyOptimistic(queryClient: QueryClient, change: ParticipationChange): Promise<OptimisticContext> {
  const detailKey = queryKeys.me.savedTenders.detail(change.tenderId);
  await Promise.all(
    [detailKey, queryKeys.me.savedTenders.ids, queryKeys.me.savedTenders.lists, queryKeys.me.savedTenders.everything].map((queryKey) =>
      queryClient.cancelQueries({ queryKey }),
    ),
  );
  const detail = queryClient.getQueryData<SavedTender>(detailKey);
  const ids = queryClient.getQueryData<SavedTenderIdsResponse>(queryKeys.me.savedTenders.ids);
  const lists = listQueries(queryClient);
  if (!('remove' in change)) {
    const now = new Date().toISOString();
    if (detail) queryClient.setQueryData(detailKey, applyBody(detail, change.body, now));
    for (const [key, data] of lists) {
      const next = replaceInList(data, change.tenderId, (item) => applyBody(item, change.body, now));
      if (next !== data) queryClient.setQueryData(key, next);
    }
  }
  if (ids) queryClient.setQueryData(queryKeys.me.savedTenders.ids, applyIds(ids, change));
  return { detail, ids, lists };
}

export function rollbackOptimistic(queryClient: QueryClient, change: ParticipationChange, context: OptimisticContext) {
  if (context.detail) queryClient.setQueryData(queryKeys.me.savedTenders.detail(change.tenderId), context.detail);
  if (context.ids) queryClient.setQueryData(queryKeys.me.savedTenders.ids, context.ids);
  for (const [key, data] of context.lists) queryClient.setQueryData(key, data);
}

/** The server's answer replaces the optimistic copy until the refetch lands (it decides `monitored`). */
export function commitParticipation(queryClient: QueryClient, saved: SavedTender) {
  queryClient.setQueryData(queryKeys.me.savedTenders.detail(saved.tender.id), saved);
  for (const [key, data] of listQueries(queryClient)) {
    const next = replaceInList(data, saved.tender.id, () => saved);
    if (next !== data) queryClient.setQueryData(key, next);
  }
}
