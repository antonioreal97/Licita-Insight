import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { isApiError } from '@/api';
import { signInWithGoogle, useSession } from '@/features/auth/hooks/use-session';
import { toast } from '@/hooks/use-toast';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';

export function useBilling() {
  const { status } = useSession();
  return useQuery({
    queryKey: queryKeys.me.billing,
    queryFn: ({ signal }) => accountService.getBilling(signal),
    enabled: status === 'authenticated',
    staleTime: 15_000,
  });
}

/** Signed out → Google. Signed in without an active subscription → Configurações. */
export function useRequireEntitled() {
  const session = useSession();
  const billing = useBilling();
  const [, navigate] = useLocation();

  return useCallback(() => {
    if (session.status === 'anonymous') {
      signInWithGoogle();
      return false;
    }
    if (session.status !== 'authenticated' || billing.isPending) {
      toast({
        variant: session.error ? 'destructive' : 'default',
        title: session.error ? 'Não foi possível verificar sua sessão' : 'Verificando sua assinatura',
        description: session.error ? 'Recarregue a página e tente de novo.' : 'Aguarde um instante e tente de novo.',
      });
      return false;
    }
    if (billing.isError) {
      console.error('[billing] Falha ao consultar a assinatura.', billing.error);
      toast({
        variant: 'destructive',
        title: 'Não foi possível verificar sua assinatura',
        description:
          isApiError(billing.error) && billing.error.requestId ? `Tente de novo. ref. ${billing.error.requestId}` : 'Recarregue a página e tente de novo.',
      });
      return false;
    }
    if (!billing.data.entitled) {
      navigate('/settings?billing=required#assinatura');
      return false;
    }
    return true;
  }, [billing.data, billing.error, billing.isError, billing.isPending, navigate, session.error, session.status]);
}
