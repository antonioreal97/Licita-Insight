import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError, type SavedSearch, type SavedSearchesResponse, type TenderSearchParams } from '@/api';
import { useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { accountService } from '@/services/account-service';
import { scopedMeQueryKeys } from '@/services/query-keys';
import { useActiveWorkspaceId } from '@/features/workspaces/workspace-scope';

// Mutations don't toast: callers show `error` (409 CONFLICT = limit of 50 searches or `duplicate` query with `existingId`; 400 INVALID_PARAMETER = invalid name/query).

/** Saved searches of the signed-in user (`updatedAt desc`). Disabled while signed out. */
export function useSavedSearches() {
  const { status } = useSession();
  const billing = useBilling();
  const workspaceId = useActiveWorkspaceId();
  return useQuery({
    queryKey: scopedMeQueryKeys(workspaceId).savedSearches,
    queryFn: ({ signal }) => accountService.listSavedSearches(signal),
    enabled: status === 'authenticated' && billing.data?.entitled === true,
  });
}

/** Writes the server's copy into the list, so the UI updates before the refetch. */
function useReplaceInList() {
  const queryClient = useQueryClient();
  const workspaceId = useActiveWorkspaceId();
  const key = scopedMeQueryKeys(workspaceId).savedSearches;
  return (search: SavedSearch) => {
    queryClient.setQueryData<SavedSearchesResponse>(key, (list) =>
      list ? { data: [search, ...list.data.filter((item) => item.id !== search.id)] } : list,
    );
    queryClient.invalidateQueries({ queryKey: key });
  };
}

/** `params` is turned into the canonical `query` (no page, pageSize or view) by the service. */
export function useCreateSavedSearch() {
  const replace = useReplaceInList();
  const queryClient = useQueryClient();
  const workspaceId = useActiveWorkspaceId();
  const key = scopedMeQueryKeys(workspaceId).savedSearches;
  return useMutation({
    mutationFn: (input: { name: string; params: TenderSearchParams; alertsEnabled: boolean }) => accountService.createSavedSearch(input),
    onSuccess: replace,
    // 409 means the list is stale (limit reached or the same query saved elsewhere): refetch it.
    onError: (error) => {
      if (isApiError(error) && error.code === 'CONFLICT') queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useUpdateSavedSearch() {
  const replace = useReplaceInList();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; params?: TenderSearchParams; alertsEnabled?: boolean }) =>
      accountService.updateSavedSearch(id, input),
    onSuccess: replace,
  });
}

export function useDeleteSavedSearch() {
  const queryClient = useQueryClient();
  const workspaceId = useActiveWorkspaceId();
  const key = scopedMeQueryKeys(workspaceId).savedSearches;
  return useMutation({
    mutationFn: (id: string) => accountService.deleteSavedSearch(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<SavedSearchesResponse>(key, (list) =>
        list ? { data: list.data.filter((item) => item.id !== id) } : list,
      );
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** Undoes a delete (same id, keeps history) within 30 s; 409 `restore_expired` after that. */
export function useRestoreSavedSearch() {
  const replace = useReplaceInList();
  return useMutation({ mutationFn: (id: string) => accountService.restoreSavedSearch(id), onSuccess: replace });
}

/** Resets `newMatchesCount` (call when the user opens the saved search). Keeps the list order: `/seen` isn't an edit. */
export function useMarkSavedSearchSeen() {
  const queryClient = useQueryClient();
  const workspaceId = useActiveWorkspaceId();
  const key = scopedMeQueryKeys(workspaceId).savedSearches;
  return useMutation({
    mutationFn: (id: string) => accountService.markSavedSearchSeen(id),
    onSuccess: (search) =>
      queryClient.setQueryData<SavedSearchesResponse>(key, (list) =>
        list ? { data: list.data.map((item) => (item.id === search.id ? search : item)) } : list,
      ),
  });
}
