import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EmailPreferences, NotificationPreferences, UnsubscribeScope } from '@/api';
import { useSession } from '@/features/auth/hooks/use-session';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';

/** E-mail preferences of the signed-in user. No subscription gate: any account can see and change them. */
export function useNotificationPreferences() {
  const { status } = useSession();
  return useQuery({
    queryKey: queryKeys.me.notificationPreferences,
    queryFn: ({ signal }) => accountService.getNotificationPreferences(signal),
    enabled: status === 'authenticated',
  });
}

const UPDATE_KEY = ['update-notification-preferences'];

/** Optimistic PUT of one or both switches; rolls back on error. The error stays on the mutation for the caller to show. */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  const key = queryKeys.me.notificationPreferences;
  return useMutation({
    mutationKey: UPDATE_KEY,
    mutationFn: (email: Partial<EmailPreferences>) => accountService.updateNotificationPreferences({ email }),
    onMutate: async (email) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferences>(key);
      if (previous) queryClient.setQueryData<NotificationPreferences>(key, { ...previous, email: { ...previous.email, ...email } });
      return { previous };
    },
    onError: (error, _email, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      console.error('[notificacoes] Falha ao salvar as preferências de e-mail.', error);
    },
    // Quick toggles overlap: only the last response in flight is the full truth (an earlier one may lack the later change).
    onSuccess: (next) => {
      if (queryClient.isMutating({ mutationKey: UPDATE_KEY }) === 1) queryClient.setQueryData(key, next);
    },
  });
}

/** Public one-click opt-out from the e-mail link. Never fired on page load: the user confirms (mail scanners prefetch links). */
export function useUnsubscribe() {
  return useMutation({
    mutationFn: ({ token, scope }: { token: string; scope: UnsubscribeScope }) => accountService.unsubscribe(token, scope),
    onError: (error) => console.error('[descadastro] Falha ao descadastrar o e-mail.', error),
  });
}
