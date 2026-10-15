import { useCallback } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError, type SavedTender, type SavedTenderIdsResponse, type SaveTenderBody } from '@/api';
import { isMaintenance } from '@/api/maintenance';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/hooks/use-toast';
import { useRequireEntitled } from '@/features/billing/hooks/use-billing';
import { errorDescription, useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { accountService } from '@/services/account-service';
import { scopedMeQueryKeys } from '@/services/query-keys';
import { MONITORED_STAGES, STAGE_LABELS } from '../lib/stages';
import { useActiveWorkspaceId } from '@/features/workspaces/workspace-scope';

const mutationKey = (workspaceId?: string) => (workspaceId ? ['saved-tenders', workspaceId, 'participation'] : ['saved-tenders', 'participation']);
/** Prefix of this hook's mutations and of the save/monitor toggles in `useSavedTenders`. */
const savedTenderMutations = (workspaceId?: string) => (workspaceId ? ['saved-tenders', workspaceId] : ['saved-tenders']);

/**
 * `previous` is the saved tender before the change, `null` when it is not saved yet: it drives the optimistic state,
 * the toasts and Undo. `remove` only exists to undo a first save.
 */
export type ParticipationChange = { tenderId: string; previous: SavedTender | null; restoreMonitoring?: boolean } & ({ body: SaveTenderBody } | { remove: true });

/** Mirrors the server rule (participation-v1): entering an active stage turns monitoring on, `dismissed` turns it off. */
function expectedMonitored(saved: SavedTender | null, body: SaveTenderBody) {
  const stage = body.stage ?? saved?.stage ?? 'analyzing';
  const changed = !saved || stage !== saved.stage;
  if (changed && MONITORED_STAGES.includes(stage)) return true;
  if (changed && stage === 'dismissed') return false;
  return body.monitored ?? saved?.monitored ?? false;
}

function applyBody(saved: SavedTender, body: SaveTenderBody): SavedTender {
  const now = new Date().toISOString();
  const checklist = new Map(saved.checklist.map((item) => [item.key, item]));
  for (const item of body.checklist ?? []) {
    const note = item.note === undefined ? (checklist.get(item.key)?.note ?? null) : item.note;
    checklist.set(item.key, { key: item.key, state: item.state, note, updatedAt: now });
  }
  const stage = body.stage ?? saved.stage;
  return {
    ...saved,
    // Keep form values stable until success, so a failed request does not remount/erase the draft.
    stage,
    stageAt: stage === saved.stage ? saved.stageAt : now,
    monitored: expectedMonitored(saved, body),
    checklist: [...checklist.values()],
  };
}

function applyIds(ids: SavedTenderIdsResponse, change: ParticipationChange): SavedTenderIdsResponse {
  const without = (list: string[]) => list.filter((id) => id !== change.tenderId);
  if ('remove' in change) return { saved: without(ids.saved), monitored: without(ids.monitored) };
  const saved = ids.saved.includes(change.tenderId) ? ids.saved : [change.tenderId, ...ids.saved];
  return { saved, monitored: expectedMonitored(change.previous, change.body) ? [...without(ids.monitored), change.tenderId] : without(ids.monitored) };
}

function errorTitle(change: ParticipationChange) {
  if ('remove' in change) return 'Não foi possível desfazer';
  if (change.body.stage !== undefined) return 'Não foi possível mudar a etapa';
  if (change.body.checklist) return 'Não foi possível salvar a marcação';
  return 'Não foi possível salvar a participação';
}

/** The user's participation in one tender (`GET /me/saved-tenders/{id}`). Only fetched when the tender is saved. */
export function useSavedTender(tenderId: string) {
  const { isSaved, entitled } = useSavedTenders();
  const workspaceId = useActiveWorkspaceId();
  const keys = scopedMeQueryKeys(workspaceId);
  const saved = isSaved(tenderId);
  // A GET while a save is in flight would 404: wait for the PUT, whose response fills the cache.
  const mutating = useIsMutating({ mutationKey: savedTenderMutations(workspaceId) }) > 0;
  const query = useQuery({
    queryKey: keys.savedTenders.detail(tenderId),
    queryFn: ({ signal }) => accountService.getSavedTender(tenderId, signal),
    enabled: entitled && saved && !mutating,
  });
  return { query, saved, participation: saved ? (query.data ?? null) : null };
}

/**
 * Stage, checklist, protocol and next action (`PUT /me/saved-tenders/{id}`), optimistic with rollback.
 * Signed out → Google; without access → subscription (same gate as saving). Stage changes that switch monitoring toast with Undo.
 */
export function useUpdateParticipation() {
  const queryClient = useQueryClient();
  const requireEntitled = useRequireEntitled();
  const workspaceId = useActiveWorkspaceId();
  const keys = scopedMeQueryKeys(workspaceId);
  const mutations = mutationKey(workspaceId);
  const mutationPrefix = savedTenderMutations(workspaceId);
  const busy = useIsMutating({ mutationKey: mutationPrefix }) > 0;

  const mutation = useMutation({
    mutationKey: mutations,
    mutationFn: async (change: ParticipationChange): Promise<SavedTender | null> => {
      if ('remove' in change) {
        await accountService.removeSavedTender(change.tenderId);
        return null;
      }
      const saved = await accountService.updateParticipation(change.tenderId, change.body);
      // Entering an active stage forces monitoring on. Undo restores the former toggle separately.
      return change.restoreMonitoring !== undefined && saved.monitored !== change.restoreMonitoring
        ? accountService.updateParticipation(change.tenderId, { monitored: change.restoreMonitoring })
        : saved;
    },
    onMutate: async (change) => {
      const detailKey = keys.savedTenders.detail(change.tenderId);
      await Promise.all([queryClient.cancelQueries({ queryKey: detailKey }), queryClient.cancelQueries({ queryKey: keys.savedTenders.ids })]);
      const detail = queryClient.getQueryData<SavedTender>(detailKey);
      const ids = queryClient.getQueryData<SavedTenderIdsResponse>(keys.savedTenders.ids);
      if (detail && !('remove' in change)) queryClient.setQueryData(detailKey, applyBody(detail, change.body));
      if (ids) queryClient.setQueryData(keys.savedTenders.ids, applyIds(ids, change));
      return { detail, ids };
    },
    onError: (error, change, context) => {
      if (context?.detail) queryClient.setQueryData(keys.savedTenders.detail(change.tenderId), context.detail);
      if (context?.ids) queryClient.setQueryData(keys.savedTenders.ids, context.ids);
      console.error('[participation] Falha ao atualizar a participação.', error);
      // 401 ("Sua sessão expirou") and the maintenance window are announced once, globally.
      if ((isApiError(error) && error.status === 401) || isMaintenance(error)) return;
      toast({ variant: 'destructive', title: errorTitle(change), description: errorDescription(error) });
    },
    onSuccess: (data, change) => {
      if (!data || 'remove' in change) return;
      if (queryClient.isMutating({ mutationKey: mutations }) === 1) queryClient.setQueryData(keys.savedTenders.detail(change.tenderId), data);

      const { previous } = change;
      const undo = previous ? (
        <ToastAction
          altText="Desfazer"
          data-testid="button-undo-participation"
          onClick={() =>
            !queryClient.isMutating({ mutationKey: mutationPrefix }) && mutation.mutate({ tenderId: change.tenderId, previous: data, body: { stage: previous.stage }, restoreMonitoring: previous.monitored })
          }
        >
          Desfazer
        </ToastAction>
      ) : undefined;
      if (change.body.stage === undefined || change.body.stage === previous?.stage) {
        if (!previous) toast({ title: 'Edital salvo', description: 'Sua marcação fica guardada em Editais salvos, na etapa Analisando.', action: undo });
        return;
      }
      const turnedOn = data.monitored && !previous?.monitored;
      const turnedOff = !data.monitored && Boolean(previous?.monitored);
      const title =
        data.stage === 'participating'
          ? 'Participação marcada'
          : data.stage === 'dismissed'
            ? 'Marcado como “Não vou participar”'
            : turnedOn || !previous
              ? `Etapa: ${STAGE_LABELS[data.stage]}`
              : null;
      if (!title) return;
      const description = turnedOn
        ? 'Monitoramento ligado: avisamos aqui quando prazo, status, valor ou documentos mudarem.'
        : turnedOff
          ? 'O monitoramento deste edital foi desligado.'
          : !previous
            ? 'O edital foi salvo na sua conta.'
            : undefined;
      toast({ title, description, action: undo });
    },
    // Refetch the truth once the last in-flight change settles; earlier refetches would flash intermediate states.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: mutations }) === 1) queryClient.invalidateQueries({ queryKey: keys.savedTenders.all });
    },
  });

  const { mutate } = mutation;
  const update = useCallback(
    (change: ParticipationChange) => {
      if (requireEntitled() && !queryClient.isMutating({ mutationKey: mutationPrefix })) mutate(change);
    },
    [mutate, mutationPrefix, requireEntitled, queryClient],
  );
  /** The stage this instance is switching to, for the button spinner. */
  const pendingStage = mutation.isPending && mutation.variables && 'body' in mutation.variables ? mutation.variables.body.stage : undefined;
  return { update, pendingStage, isPending: busy };
}
