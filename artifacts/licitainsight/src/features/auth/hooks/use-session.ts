import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import type { User } from '@/api';
import { toast } from '@/hooks/use-toast';
import { optionalStorageAllowed, readCookieConsent } from '@/features/privacy/cookie-consent';
import { trackAuthentication } from '@/features/analytics/google-analytics';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';

export const LAST_ACTIVITY_KEY = 'licita-last-activity';
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIVITY_WRITE_MS = 5_000;
const NEW_ACCOUNT_WINDOW_MS = 5 * 60_000;

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

const OAUTH_PENDING_KEY = 'licita-oauth-pending';

/** Full-page navigation to Google (via the API). Default `returnTo`: the page the user is on. */
export function signInWithGoogle(returnTo: string = window.location.pathname + window.location.search): void {
  try {
    sessionStorage.setItem(OAUTH_PENDING_KEY, '1');
  } catch (error) {
    console.error('[auth] Não foi possível marcar o login em andamento.', error);
  }
  window.location.assign(accountService.googleSignInUrl(returnTo));
}

function forgetSession(queryClient: ReturnType<typeof useQueryClient>): void {
  clearLastActivity();
  try {
    sessionStorage.removeItem('pardal-triage-v1');
  } catch (error) {
    console.error('[auth] Não foi possível apagar o progresso da triagem.', error);
  }
  queryClient.removeQueries({ queryKey: queryKeys.me.all });
  queryClient.setQueryData(queryKeys.session, null);
}

export function clearLastActivity(): void {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch (error) {
    console.error('[auth] Não foi possível apagar o relógio de inatividade.', error);
  }
}

function readLastActivity(): number | null {
  if (!optionalStorageAllowed()) return null;
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const at = Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch (error) {
    console.error('[auth] Não foi possível ler o relógio de inatividade.', error);
    return null;
  }
}
function writeLastActivity(now: number): void {
  if (!optionalStorageAllowed()) return;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch (error) {
    console.error('[auth] Não foi possível gravar o relógio de inatividade.', error);
  }
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  return useMutation({
    mutationFn: () => accountService.logout(),
    onSuccess: () => {
      forgetSession(queryClient);
      navigate('/');
    },
    onError: (error) => {
      console.error('[auth] Falha ao sair.', error);
      toast({ variant: 'destructive', title: 'Não foi possível sair', description: 'Verifique a conexão e tente novamente.' });
    },
  });
}

export function useSignOutEverywhere() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  return useMutation({
    mutationFn: () => accountService.logoutAll(),
    onSuccess: () => {
      forgetSession(queryClient);
      navigate('/');
      toast({ title: 'Você saiu de todos os dispositivos', description: 'Entre de novo com o Google para continuar.' });
    },
    onError: (error) => {
      console.error('[auth] Falha ao sair de todos os dispositivos.', error);
      toast({ variant: 'destructive', title: 'Não foi possível sair dos dispositivos', description: 'Verifique a conexão e tente novamente.' });
    },
  });
}

/** Logs the open session out after 10 minutes without a click, key, or scroll. Other tabs share the clock. */
export function useIdleSession(): void {
  const { status, user } = useSession();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const navigateRef = useRef(navigate);
  const queryClientRef = useRef(queryClient);
  navigateRef.current = navigate;
  queryClientRef.current = queryClient;

  useEffect(() => {
    if (status !== 'authenticated') return;

    let timer = 0;
    let lastWrite = 0;
    let ending = false;

    const arm = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void endSession(), delay);
    };

    const markActivity = () => {
      const now = Date.now();
      arm(IDLE_TIMEOUT_MS);
      if (now - lastWrite < ACTIVITY_WRITE_MS) return;
      lastWrite = now;
      writeLastActivity(now);
    };

    const endSession = async () => {
      if (ending) return;
      ending = true;
      try {
        await accountService.logout();
      } catch (error) {
        ending = false;
        console.error('[auth] Falha ao encerrar a sessão por inatividade.', error);
        toast({ variant: 'destructive', title: 'Não foi possível sair', description: 'Verifique a conexão e tente novamente.' });
        arm(15_000);
        return;
      }
      forgetSession(queryClientRef.current);
      navigateRef.current('/login');
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== LAST_ACTIVITY_KEY) return;
      if (event.newValue === null) {
        if (readCookieConsent() === 'refused') return;
        queryClientRef.current.removeQueries({ queryKey: queryKeys.me.all });
        queryClientRef.current.setQueryData(queryKeys.session, null);
        navigateRef.current('/login');
        return;
      }
      const at = Number(event.newValue);
      if (!Number.isFinite(at)) return;
      arm(Math.max(0, at + IDLE_TIMEOUT_MS - Date.now()));
    };

    const pendingLogin = (() => {
      try {
        return sessionStorage.getItem(OAUTH_PENDING_KEY) === '1';
      } catch (error) {
        console.error('[auth] Não foi possível ler o login em andamento.', error);
        return false;
      }
    })();
    if (pendingLogin) {
      try {
        sessionStorage.removeItem(OAUTH_PENDING_KEY);
      } catch (error) {
        console.error('[auth] Não foi possível concluir o login em andamento.', error);
      }
      const createdAt = user ? Date.parse(user.createdAt) : Number.NaN;
      const accountAge = Date.now() - createdAt;
      trackAuthentication(Number.isFinite(accountAge) && accountAge >= 0 && accountAge <= NEW_ACCOUNT_WINDOW_MS ? 'sign_up' : 'login');
      markActivity();
    } else {
      const stored = readLastActivity();
      if (stored !== null && Date.now() - stored >= IDLE_TIMEOUT_MS) void endSession();
      else if (stored === null) markActivity();
      else arm(stored + IDLE_TIMEOUT_MS - Date.now());
    }
    window.addEventListener('pointerdown', markActivity);
    window.addEventListener('keydown', markActivity);
    window.addEventListener('scroll', markActivity, true);
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', markActivity);
      window.removeEventListener('keydown', markActivity);
      window.removeEventListener('scroll', markActivity, true);
      window.removeEventListener('storage', onStorage);
    };
  }, [status, user]);
}
