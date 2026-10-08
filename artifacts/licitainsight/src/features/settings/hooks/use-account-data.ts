import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { clearLastActivity } from '@/features/auth/hooks/use-session';
import { toast } from '@/hooks/use-toast';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';

/** LGPD export: downloads `GET /me/export` with the server's filename. Errors stay on the mutation for the caller to show. */
export function useExportAccountData() {
  return useMutation({
    mutationFn: async () => {
      const { blob, filename } = await accountService.exportAccountData();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? 'abriu-la-dados.json';
      document.body.append(link);
      link.click();
      link.remove();
      // Revoke after the click has handed the blob to the download manager.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onError: (error) => console.error('[lgpd] Falha ao exportar os dados da conta.', error),
  });
}

/** LGPD delete (`DELETE /me`, confirm "EXCLUIR"). On 204 the cookie is already gone: drop the user's cache and go to the landing page. */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  return useMutation({
    mutationFn: () => accountService.deleteAccount(),
    onSuccess: () => {
      clearLastActivity();
      queryClient.removeQueries({ queryKey: queryKeys.me.all });
      queryClient.setQueryData(queryKeys.session, null);
      navigate('/');
      toast({ title: 'Conta excluída', description: 'Seus dados pessoais foram apagados do Pardal Digital.' });
    },
    onError: (error) => console.error('[lgpd] Falha ao excluir a conta.', error),
  });
}
