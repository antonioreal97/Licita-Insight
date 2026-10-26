import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DismissNotificationsBody, Notification, NotificationsParams, NotificationsResponse, RestoreNotificationsBody, UnreadCountResponse } from '@/api';
import { useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';

const listsKey = [...queryKeys.me.notifications.all, 'list'] as const;

/** In-app notifications (`createdAt desc`). The response's `unreadCount` also refreshes the badge cache. */
export function useNotifications({ unreadOnly, page, pageSize }: NotificationsParams) {
  const { status } = useSession();
  const billing = useBilling();
  const queryClient = useQueryClient();
  const params: NotificationsParams = { unreadOnly, page, pageSize };
  return useQuery({
    queryKey: queryKeys.me.notifications.list(params),
    queryFn: async ({ signal }) => {
      const response = await accountService.listNotifications(params, signal);
      queryClient.setQueryData<UnreadCountResponse>(queryKeys.me.notifications.unreadCount, { unreadCount: response.unreadCount });
      return response;
    },
    enabled: status === 'authenticated' && billing.data?.entitled === true,
    placeholderData: keepPreviousData,
  });
}

/**
 * Unread badge count (`data` is a number). Polls every 60 s while signed in; React Query skips the interval while the tab
 * is hidden (refetchIntervalInBackground is false) and refetches when it becomes visible again.
 */
export function useUnreadCount() {
  const { status } = useSession();
  const billing = useBilling();
  return useQuery({
    queryKey: queryKeys.me.notifications.unreadCount,
    queryFn: ({ signal }) => accountService.getUnreadCount(signal),
    select: (response) => response.unreadCount,
    enabled: status === 'authenticated' && billing.data?.entitled === true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
}

/** `{ ids }` marks some, `{ all: true }` marks everything. Updates the unread count and refetches the lists. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids?: string[]; all?: boolean }) => accountService.markNotificationsRead(input),
    onSuccess: (response) => {
      queryClient.setQueryData<UnreadCountResponse>(queryKeys.me.notifications.unreadCount, response);
      queryClient.invalidateQueries({ queryKey: listsKey });
    },
  });
}

/**
 * Removes notifications (`{ ids }` or `{ allRead: true }`). They leave every cached list at once (Monitoramento and the
 * bell share the cache), so a removed row never flashes back; the lists refetch afterwards for totals and pagination.
 */
export function useDismissNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DismissNotificationsBody) => accountService.dismissNotifications(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listsKey });
      const removed = (n: Notification) => (input.allRead ? n.readAt !== null : input.ids?.includes(n.id) === true);
      queryClient.setQueriesData<NotificationsResponse>({ queryKey: listsKey }, (page) =>
        page && page.data.some(removed) ? { ...page, data: page.data.filter((n) => !removed(n)) } : page,
      );
    },
    onSuccess: ({ unreadCount }) => {
      queryClient.setQueryData<UnreadCountResponse>(queryKeys.me.notifications.unreadCount, { unreadCount });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listsKey }),
  });
}

/** Undoes a removal (`{ dismissedAt }` from the dismiss response, or `{ ids }`). */
export function useRestoreNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RestoreNotificationsBody) => accountService.restoreNotifications(input),
    onSuccess: ({ unreadCount }) => {
      queryClient.setQueryData<UnreadCountResponse>(queryKeys.me.notifications.unreadCount, { unreadCount });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listsKey }),
  });
}
