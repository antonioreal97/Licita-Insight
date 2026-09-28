import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError, type SavedTenderIdsResponse } from '@/api';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/hooks/use-toast';
import { useSession } from '@/features/auth/hooks/use-session';
import { useBilling, useRequireEntitled } from '@/features/billing/hooks/use-billing';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';

/** Before accounts, saved ids lived in this browser. They are imported once into the account, then the key is removed. */
const LEGACY_STORAGE_KEY = 'licita-saved-tenders';
const EMPTY: string[] = [];
const MUTATION_KEY = ['saved-tenders', 'change'];

export type SavedTendersStatus = 'anonymous' | 'loading' | 'ready' | 'error';

type Change = { id: string; save: false; wasMonitored?: boolean } | { id: string; save: true; monitored?: boolean };

function applyChange(ids: SavedTenderIdsResponse, change: Change): SavedTenderIdsResponse {
  const without = (list: string[]) => list.filter((item) => item !== change.id);
  if (!change.save) return { saved: without(ids.saved), monitored: without(ids.monitored) };
  const saved = ids.saved.includes(change.id) ? ids.saved : [change.id, ...ids.saved];
  if (change.monitored === undefined) return { saved, monitored: ids.monitored };
  return { saved, monitored: change.monitored ? [...without(ids.monitored), change.id] : without(ids.monitored) };
}

export function errorDescription(error: unknown) {
  if (isApiError(error) && error.code === 'SUBSCRIPTION_REQUIRED') return 'Assine para salvar e acompanhar editais.';
  if (isApiError(error) && error.code === 'CONFLICT') return 'Você atingiu o limite de 500 editais salvos. Remova alguns e tente de novo.';
  if (isApiError(error) && error.code === 'NETWORK_ERROR') return 'Sem conexão com o servidor. Tente de novo.';
  return isApiError(error) && error.requestId ? `Tente de novo. ref. ${error.requestId}` : 'Tente de novo.';
}

function readLegacyIds(): string[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) return parsed;
    console.error(`[saved-tenders] Valor inválido em localStorage "${LEGACY_STORAGE_KEY}"; nada a importar.`);
  } catch (error) {
    console.error(`[saved-tenders] Não foi possível ler localStorage "${LEGACY_STORAGE_KEY}".`, error);
  }
  return [];
}

// Once per page load: every useSavedTenders caller mounts this effect, only the first one imports.
let importStarted = false;

function useImportLegacySaved(entitled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!entitled || importStarted) return;
    importStarted = true;
    const ids = readLegacyIds();
    if (ids.length === 0) return;
    accountService.importSavedTenders(ids).then(
      (result) => {
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch (error) {
          console.error(`[saved-tenders] Importado, mas não foi possível apagar localStorage "${LEGACY_STORAGE_KEY}".`, error);
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.me.savedTenders.all });
        const missing = result.notFound.length;
        const skipped = result.skippedByLimit;
        if (result.imported === 0 && missing === 0 && skipped === 0) return;
        const notes = [
          missing > 0 ? `${missing} ${missing === 1 ? 'edital não existe mais na base e ficou' : 'editais não existem mais na base e ficaram'} de fora.` : null,
          skipped > 0 ? `${skipped} ${skipped === 1 ? 'edital não coube' : 'editais não couberam'} no limite de 500 salvos.` : null,
        ].filter(Boolean);
        toast({
          variant: skipped > 0 ? 'destructive' : 'default',
          title:
            result.imported === 1
              ? '1 edital salvo neste navegador foi adicionado à sua conta'
              : `${result.imported} editais salvos neste navegador foram adicionados à sua conta`,
          description: notes.length ? notes.join(' ') : undefined,
        });
      },
      (error) => {
        // The key stays: the next page load tries again.
        console.error('[saved-tenders] Falha ao importar os editais salvos neste navegador.', error);
        toast({ variant: 'destructive', title: 'Não foi possível trazer os editais salvos neste navegador', description: errorDescription(error) });
      },
    );
  }, [entitled, queryClient]);
}

/**
 * Saved / monitored tender ids of the signed-in user (`/me/saved-tenders/ids`), with optimistic toggles.
 * Signed out, `toggle` and `toggleMonitor` start the Google sign-in and come back to this page.
 */
export function useSavedTenders() {
  const session = useSession();
  const billing = useBilling();
  const requireEntitled = useRequireEntitled();
  const entitled = billing.data?.entitled === true;
  const authenticated = session.status === 'authenticated';
  const queryClient = useQueryClient();
  useImportLegacySaved(entitled);

  const ids = useQuery({
    queryKey: queryKeys.me.savedTenders.ids,
    queryFn: ({ signal }) => accountService.getSavedTenderIds(signal),
    enabled: entitled,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: async (change: Change) => {
      if (change.save) await accountService.saveTender(change.id, change.monitored);
      else await accountService.removeSavedTender(change.id);
    },
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.me.savedTenders.ids });
      const previous = queryClient.getQueryData<SavedTenderIdsResponse>(queryKeys.me.savedTenders.ids);
      if (previous) queryClient.setQueryData(queryKeys.me.savedTenders.ids, applyChange(previous, change));
      return { previous };
    },
    onError: (error, change, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.me.savedTenders.ids, context.previous);
      console.error('[saved-tenders] Falha ao atualizar edital salvo.', error);
      // 401 is announced once, globally ("Sua sessão expirou").
      if (isApiError(error) && error.status === 401) return;
      const title = !change.save
        ? 'Não foi possível remover o edital'
        : change.monitored === undefined
          ? 'Não foi possível salvar o edital'
          : 'Não foi possível atualizar o monitoramento';
      toast({ variant: 'destructive', title, description: errorDescription(error) });
    },
    // Declarations are deleted with the save. Re-saving is not an undo of that data loss.
    onSuccess: (_data, change) => {
      if (change.save) return;
      toast({
        title: 'Edital removido dos salvos',
        description: 'O monitoramento foi desligado, e a etapa e as marcações deste edital foram apagadas.',
        action: (
          <ToastAction
            altText="Salvar novamente sem restaurar a participação anterior"
            data-testid="button-undo-unsave-monitored"
            onClick={() => mutation.mutate({ id: change.id, save: true, monitored: change.wasMonitored })}
          >
            Salvar novamente
          </ToastAction>
        ),
      });
    },
    // Refetch the truth once the last in-flight toggle settles; earlier refetches would flash intermediate states.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) === 1) queryClient.invalidateQueries({ queryKey: queryKeys.me.savedTenders.all });
    },
  });

  // Only trust ids while signed in: after a 401 the observer may still hold the previous user's data.
  const saved = (authenticated && ids.data?.saved) || EMPTY;
  const monitored = (authenticated && ids.data?.monitored) || EMPTY;
  const isSaved = useCallback((id: string) => saved.includes(id), [saved]);
  const isMonitored = useCallback((id: string) => monitored.includes(id), [monitored]);

  const { mutate } = mutation;
  // Reads the cache at call time (not the render closure), so an Undo in a toast sees the current state.
  const change = useCallback(
    (build: (current: SavedTenderIdsResponse) => Change) => {
      if (!requireEntitled()) return;
      const current = queryClient.getQueryData<SavedTenderIdsResponse>(queryKeys.me.savedTenders.ids);
      if (!current) {
        const failed = queryClient.getQueryState(queryKeys.me.savedTenders.ids)?.status === 'error';
        toast({
          variant: 'destructive',
          title: failed ? 'Não foi possível carregar seus editais salvos' : 'Seus editais salvos ainda não carregaram',
          description: failed ? 'Recarregue a página e tente de novo.' : 'Aguarde um instante e tente de novo.',
        });
        return;
      }
      mutate(build(current));
    },
    [queryClient, mutate, requireEntitled],
  );
  const toggle = useCallback(
    (id: string) => {
      const current = queryClient.getQueryData<SavedTenderIdsResponse>(queryKeys.me.savedTenders.ids);
      if (current?.saved.includes(id) && !window.confirm('Remover este edital dos salvos? Isso apaga sua etapa, checklist, protocolo, próxima ação e histórico, e desliga o monitoramento. Salvar novamente não recupera esses dados.')) return;
      change((current) => {
        if (!current.saved.includes(id)) return { id, save: true };
        return { id, save: false, wasMonitored: current.monitored.includes(id) };
      });
    },
    [change, queryClient],
  );
  /** Monitoring implies saving: turning it on saves the tender too; turning it off keeps it saved. */
  const toggleMonitor = useCallback((id: string) => change((current) => ({ id, save: true, monitored: !current.monitored.includes(id) })), [change]);

  const status: SavedTendersStatus =
    session.status === 'anonymous'
      ? 'anonymous'
      : ids.data
        ? 'ready'
        : !authenticated
          ? 'loading'
          : billing.isError || ids.isError
            ? 'error'
            : billing.isSuccess && !entitled
              ? 'ready'
              : 'loading';

  return { saved, isSaved, toggle, isMonitored, toggleMonitor, status, entitled };
}
