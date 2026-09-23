import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import type { User } from '@/api';
import { toast } from '@/hooks/use-toast';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

/** Shared by every `useSession` caller (one request per app load; refetched when stale on window focus). */
export const sessionQuery = {
  queryKey: queryKeys.session,
  queryFn: ({ signal }: { signal: AbortSignal }) => accountService.getSession(signal),
  staleTime: 5 * 60_000,
};

/**
 * `status` comes from the last known session. A failed check with no known session (network, 5xx) keeps `status: 'loading'`
 * and sets `error`: callers must not treat that as signed out. Check `error` first (RequireAuth does).
 */
export function useSession(): { user: User | null; status: SessionStatus; error: unknown } {
  const query = useQuery(sessionQuery);
  if (query.data !== undefined) return { user: query.data, status: query.data ? 'authenticated' : 'anonymous', error: query.error };
  return { user: null, status: 'loading', error: query.error };
}

/** Full-page navigation to Google (via the API). Default `returnTo`: the page the user is on. */
export function signInWithGoogle(returnTo: string = window.location.pathname + window.location.search): void {
  window.location.assign(accountService.googleSignInUrl(returnTo));
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  return useMutation({
    mutationFn: () => accountService.logout(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.me.all });
      queryClient.setQueryData(queryKeys.session, null);
      navigate('/');
    },
    onError: (error) => {
      console.error('[auth] Falha ao sair.', error);
      toast({ variant: 'destructive', title: 'Não foi possível sair', description: 'Verifique a conexão e tente novamente.' });
    },
  });
}
