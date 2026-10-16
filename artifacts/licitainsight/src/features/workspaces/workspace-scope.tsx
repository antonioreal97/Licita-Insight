import React, { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/hooks/use-session';
import { queryKeys } from '@/services/query-keys';
import { workspaceService } from '@/services/workspace-service';
import { toast } from '@/hooks/use-toast';
import { useJourneyFeatureFlags, type JourneyFlag } from './hooks/use-journey-feature-flags';
import type { CreatableWorkspaceType, WorkspaceSummary, WorkspacesResponse } from './workspace-types';

export function shouldLoadWorkspaces(status: 'loading' | 'authenticated' | 'anonymous', enabledJourneys: JourneyFlag[]) {
  return status === 'authenticated' && enabledJourneys.length > 0;
}

type WorkspaceScopeValue = {
  available: boolean;
  activeWorkspace: WorkspaceSummary | null;
  workspaceId?: string;
  workspaces: WorkspaceSummary[];
  limits: WorkspacesResponse['limits'] | null;
  enabledJourneys: JourneyFlag[];
  selectWorkspace: (workspaceId: string) => void;
  selectingWorkspaceId?: string;
  createWorkspace: (input: { type: CreatableWorkspaceType; name: string }) => Promise<WorkspaceSummary>;
  creating: boolean;
};

const LEGACY_SCOPE: WorkspaceScopeValue = {
  available: false,
  activeWorkspace: null,
  workspaces: [],
  limits: null,
  enabledJourneys: [],
  selectWorkspace: () => undefined,
  createWorkspace: () => Promise.reject(new Error('Workspace journeys are disabled')),
  creating: false,
};

const WorkspaceScopeContext = createContext<WorkspaceScopeValue>(LEGACY_SCOPE);

export function WorkspaceScopeProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const flags = useJourneyFeatureFlags();
  const queryClient = useQueryClient();
  const enabledJourneys = flags.data?.enabledJourneys ?? [];
  const enabled = shouldLoadWorkspaces(session.status, enabledJourneys);
  const list = useQuery({
    queryKey: queryKeys.me.workspaces,
    queryFn: ({ signal }) => workspaceService.list(signal),
    enabled,
    staleTime: 30_000,
  });
  const deepLinkWorkspaceId = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('workspaceId');
  // A successful list proves the runtime cutover is `workspaces`, W4 is applied and at least one journey is enabled.
  const available = enabled && list.isSuccess;
  const deepLinkedWorkspace = available && /^ws_[0-9a-f]{32}$/.test(deepLinkWorkspaceId ?? '')
    ? list.data.workspaces.find((workspace) => workspace.id === deepLinkWorkspaceId && workspace.archivedAt === null)
    : undefined;
  const activeWorkspace = available
    ? (deepLinkedWorkspace ?? list.data.workspaces.find((workspace) => workspace.id === list.data.activeWorkspaceId) ?? null)
    : null;

  const select = useMutation({
    mutationFn: (workspaceId: string) => workspaceService.setActive(workspaceId),
    onSuccess: ({ activeWorkspaceId }) => {
      queryClient.setQueryData<WorkspacesResponse>(queryKeys.me.workspaces, (current) =>
        current ? { ...current, activeWorkspaceId } : current,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.workspaceScopes });
    },
    onError: (error) => {
      console.error('[workspaces] Não foi possível trocar o Espaço ativo.', error);
      toast({ variant: 'destructive', title: 'Não foi possível trocar de Espaço', description: 'Tente novamente.' });
    },
  });

  useEffect(() => {
    if (!deepLinkedWorkspace || list.data?.activeWorkspaceId === deepLinkedWorkspace.id || select.isPending) return;
    select.mutate(deepLinkedWorkspace.id);
  }, [deepLinkedWorkspace, list.data?.activeWorkspaceId, select]);

  const create = useMutation({
    mutationFn: (input: { type: CreatableWorkspaceType; name: string }) => workspaceService.create(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.me.workspaces }),
  });

  return (
    <WorkspaceScopeContext.Provider
      value={{
        available,
        activeWorkspace,
        workspaceId: activeWorkspace?.id,
        workspaces: available ? list.data.workspaces : [],
        limits: available ? list.data.limits : null,
        enabledJourneys,
        selectWorkspace: (workspaceId) => select.mutate(workspaceId),
        selectingWorkspaceId: select.isPending ? select.variables : undefined,
        createWorkspace: (input) => create.mutateAsync(input),
        creating: create.isPending,
      }}
    >
      {children}
    </WorkspaceScopeContext.Provider>
  );
}

export const useWorkspaceScope = () => useContext(WorkspaceScopeContext);
export const useActiveWorkspaceId = () => useWorkspaceScope().workspaceId;
