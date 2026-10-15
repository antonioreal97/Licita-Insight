import type { JourneyFlag } from './hooks/use-journey-feature-flags';

export type WorkspaceType = 'procurement' | 'funding' | 'study' | 'culture';
export type WorkspaceAccessMode = 'write' | 'read_only';
export type WorkspaceOnboardingStatus = 'not_started' | 'in_progress' | 'complete';

export type WorkspaceSummary = {
  id: string;
  type: WorkspaceType;
  name: string;
  slot: number;
  role: 'owner';
  accessMode: WorkspaceAccessMode;
  onboardingStatus: WorkspaceOnboardingStatus;
  profileCompleteness: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspacesResponse = {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  limits: { used: number; maximum: 1 | 5 };
};

export type CreatableWorkspaceType = Exclude<WorkspaceType, 'study'>;

export const WORKSPACE_TYPE_LABELS: Record<WorkspaceType, string> = {
  procurement: 'Compras públicas',
  funding: 'Fomento',
  culture: 'Cultura',
  study: 'Estudo',
};

export function creatableWorkspaceTypes(enabledJourneys: JourneyFlag[]): CreatableWorkspaceType[] {
  return (['procurement', 'funding', 'culture'] as const).filter((type) => enabledJourneys.includes(type));
}
