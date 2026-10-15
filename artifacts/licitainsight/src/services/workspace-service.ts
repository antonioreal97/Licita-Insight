import { getJson, sendJson } from '@/api/adapters/http/http-client';
import type { CreatableWorkspaceType, WorkspaceSummary, WorkspacesResponse } from '@/features/workspaces/workspace-types';

const enc = encodeURIComponent;

export const workspaceService = {
  list: (signal?: AbortSignal) => getJson<WorkspacesResponse>('/v1/me/workspaces', {}, signal),
  create: (input: { type: CreatableWorkspaceType; name: string }) => sendJson<WorkspaceSummary>('POST', '/v1/me/workspaces', input),
  setActive: (workspaceId: string) =>
    sendJson<{ activeWorkspaceId: string }>('PUT', '/v1/me/active-workspace', { workspaceId }),
  detail: (workspaceId: string, signal?: AbortSignal) =>
    getJson<{ workspace: WorkspaceSummary; profile: unknown }>(`/v1/me/workspaces/${enc(workspaceId)}`, {}, signal),
};
