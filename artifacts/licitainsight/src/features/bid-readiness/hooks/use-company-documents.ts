import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompanyDocumentKind, CompanyDocumentPut } from '@/api';
import { useSession } from '@/features/auth/hooks/use-session';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';

export function useCompanyDocuments() {
  const session = useSession();
  return useQuery({
    queryKey: queryKeys.me.companyDocuments,
    queryFn: ({ signal }) => accountService.listCompanyDocuments(signal),
    enabled: session.status === 'authenticated',
    staleTime: 60_000,
  });
}

export function usePutCompanyDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, body }: { kind: CompanyDocumentKind; body: CompanyDocumentPut }) => accountService.putCompanyDocument(kind, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me.companyDocuments }),
  });
}
