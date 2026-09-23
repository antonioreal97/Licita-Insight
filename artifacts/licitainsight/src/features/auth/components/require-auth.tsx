import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocation, useSearch } from 'wouter';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { queryKeys } from '@/services/query-keys';
import { useSession } from '../hooks/use-session';

/** Renders `children` only with a session. Signed out → `/login?returnTo=<this page>` (replace, so Back doesn't loop). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, error } = useSession();
  const [location] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();

  if (status === 'loading' && error) return <ErrorState error={error} onRetry={() => queryClient.refetchQueries({ queryKey: queryKeys.session })} />;
  if (status === 'loading') return <RowsSkeleton />;
  if (status === 'anonymous') {
    const returnTo = location + (search ? `?${search}` : '');
    return <Redirect to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <>{children}</>;
}
