import { useCallback } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError, type SavedTender } from '@/api';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/hooks/use-toast';
import { useRequireEntitled } from '@/features/billing/hooks/use-billing';
import { errorDescription, useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';
import { applyOptimistic, commitParticipation, rollbackOptimistic, type ParticipationChange } from '../lib/optimistic';
import { STAGE_LABELS } from '../lib/stages';

const MUTATION_KEY = ['saved-tenders', 'participation'];
/** Prefix of this hook's mutations and of the save/monitor toggles in `useSavedTenders`. */
const SAVED_TENDERS_MUTATIONS = ['saved-tenders'];

export type { ParticipationChange };

function errorTitle(change: ParticipationChange) {
  if ('remove' in change) return 'Não foi possível desfazer';
  if (change.body.stage !== undefined) return 'Não foi possível mudar a etapa';
  if (change.body.checklist) return 'Não foi possível salvar a marcação';
  return 'Não foi possível salvar a participação';
}

/** The user's participation in one tender (`GET /me/saved-tenders/{id}`). Only fetched when the tender is saved. */
export function useSavedTender(tenderId: string) {
  const { isSaved, entitled } = useSavedTenders();
  const saved = isSaved(tenderId);
  // A GET while a save is in flight would 404: wait for the PUT, whose response fills the cache.
  const mutating = useIsMutating({ mutationKey: SAVED_TENDERS_MUTATIONS }) > 0;
  const query = useQuery({
    queryKey: queryKeys.me.savedTenders.detail(tenderId),
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
  const busy = useIsMutating({ mutationKey: SAVED_TENDERS_MUTATIONS }) > 0;

  const mutation = useMutation({
    mutationKey: MUTATION_KEY,
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
    onMutate: (change) => applyOptimistic(queryClient, change),
    onError: (error, change, context) => {
      if (context) rollbackOptimistic(queryClient, change, context);
      console.error('[participation] Falha ao atualizar a participação.', error);
      // 401 is announced once, globally ("Sua sessão expirou").
      if (isApiError(error) && error.status === 401) return;
      toast({ variant: 'destructive', title: errorTitle(change), description: errorDescription(error) });
    },
    onSuccess: (data, change) => {
      if (!data || 'remove' in change) return;
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) === 1) commitParticipation(queryClient, data);

      const { previous } = change;
      const undo = previous ? (
        <ToastAction
          altText="Desfazer"
          data-testid="button-undo-participation"
          onClick={() =>
            !queryClient.isMutating({ mutationKey: SAVED_TENDERS_MUTATIONS }) && mutation.mutate({ tenderId: change.tenderId, previous: data, body: { stage: previous.stage }, restoreMonitoring: previous.monitored })
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
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) === 1) queryClient.invalidateQueries({ queryKey: queryKeys.me.savedTenders.all });
    },
  });

  const { mutate } = mutation;
  const update = useCallback(
    (change: ParticipationChange) => {
      if (requireEntitled() && !queryClient.isMutating({ mutationKey: SAVED_TENDERS_MUTATIONS })) mutate(change);
    },
    [mutate, requireEntitled, queryClient],
  );
  /** The stage this instance is switching to, for the button spinner. */
  const pendingStage = mutation.isPending && mutation.variables && 'body' in mutation.variables ? mutation.variables.body.stage : undefined;
  return { update, pendingStage, isPending: busy };
}
