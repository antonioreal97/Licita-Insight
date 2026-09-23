import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'wouter';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { queryKeys } from '@/services/query-keys';
import { useBilling } from '../hooks/use-billing';

/** Renders `children` only with an active subscription. Otherwise sends the user to Configurações. */
export function RequireSubscription({ children }: { children: ReactNode }) {
  const billing = useBilling();
  const queryClient = useQueryClient();

  if (billing.isError) {
    return <ErrorState error={billing.error} onRetry={() => queryClient.refetchQueries({ queryKey: queryKeys.me.billing })} />;
  }
  if (!billing.data) return <RowsSkeleton />;
  if (!billing.data.entitled) return <Redirect to="/settings?billing=required" replace />;
  return <>{children}</>;
}
