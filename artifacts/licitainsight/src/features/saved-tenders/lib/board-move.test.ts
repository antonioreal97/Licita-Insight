import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import type { SavedTender, SavedTenderIdsResponse, SavedTendersResponse } from '@/api/types';
import { applyOptimistic, commitParticipation, rollbackOptimistic, type OptimisticContext, type ParticipationChange } from '@/features/participation/lib/optimistic';
import { queryKeys } from '@/services/query-keys';
import { groupByStage } from './board';
import { savedTender } from './test-fixtures';

const NOW = new Date('2026-10-20T15:00:00Z');

/** Same cache wiring as `useUpdateParticipation`, through TanStack's real mutation lifecycle. */
function setup(mutationFn: (change: ParticipationChange) => Promise<SavedTender>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const items = [savedTender({ id: 'a', stage: 'analyzing' }), savedTender({ id: 'b', stage: 'participating', monitored: true })];
  const page: SavedTendersResponse = { data: items, pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 } as SavedTendersResponse['pagination'] };
  queryClient.setQueryData(queryKeys.me.savedTenders.everything, items);
  queryClient.setQueryData(queryKeys.me.savedTenders.list({ page: 1, pageSize: 50 }), page);
  queryClient.setQueryData<SavedTenderIdsResponse>(queryKeys.me.savedTenders.ids, { saved: ['a', 'b'], monitored: ['b'] });
  const seen: string[][] = [];
  const observer = new MutationObserver<SavedTender, Error, ParticipationChange, OptimisticContext>(queryClient, {
    mutationFn: async (change) => {
      seen.push(column(queryClient, 'submitted'));
      return mutationFn(change);
    },
    onMutate: (change) => applyOptimistic(queryClient, change),
    onError: (_error, change, context) => context && rollbackOptimistic(queryClient, change, context),
    onSuccess: (data) => commitParticipation(queryClient, data),
  });
  return { queryClient, items, observer, seen };
}

const board = (queryClient: QueryClient) => groupByStage(queryClient.getQueryData<SavedTender[]>(queryKeys.me.savedTenders.everything)!, NOW);
const column = (queryClient: QueryClient, stage: string) => board(queryClient).find((item) => item.stage === stage)!.items.map((item) => item.tender.id);

test('mover de etapa: o cartão muda de coluna antes da resposta e fica com a resposta do servidor', async () => {
  const { queryClient, items, observer, seen } = setup(async (change) => ({ ...items[0], stage: 'submitted', monitored: true, stageAt: '2026-10-20T15:00:00Z', protocol: 'srv' }));
  await observer.mutate({ tenderId: 'a', previous: items[0], body: { stage: 'submitted' } });

  assert.deepEqual(seen[0], ['a'], 'atualização otimista antes do PUT terminar');
  assert.deepEqual(column(queryClient, 'analyzing'), []);
  assert.deepEqual(column(queryClient, 'submitted'), ['a']);
  const everything = queryClient.getQueryData<SavedTender[]>(queryKeys.me.savedTenders.everything)!;
  assert.equal(everything.find((item) => item.tender.id === 'a')!.protocol, 'srv', 'a resposta substitui a cópia otimista');
  const list = queryClient.getQueryData<SavedTendersResponse>(queryKeys.me.savedTenders.list({ page: 1, pageSize: 50 }))!;
  assert.equal(list.data[0].stage, 'submitted', 'a lista paginada acompanha');
  assert.deepEqual(queryClient.getQueryData<SavedTenderIdsResponse>(queryKeys.me.savedTenders.ids)!.monitored.sort(), ['a', 'b'], 'entrar em “Participação enviada” liga o monitoramento');
});

test('mover para “Não vou participar” desliga o monitoramento de forma otimista', async () => {
  let release!: () => void;
  const { queryClient, items, observer } = setup(() => new Promise((resolve) => (release = () => resolve({ ...items[1], stage: 'dismissed', monitored: false }))));
  const done = observer.mutate({ tenderId: 'b', previous: items[1], body: { stage: 'dismissed' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(column(queryClient, 'dismissed'), ['b']);
  assert.equal(queryClient.getQueryData<SavedTender[]>(queryKeys.me.savedTenders.everything)!.find((item) => item.tender.id === 'b')!.monitored, false);
  assert.deepEqual(queryClient.getQueryData<SavedTenderIdsResponse>(queryKeys.me.savedTenders.ids)!.monitored, []);
  release();
  await done;
});

test('se o PUT falha, o cartão volta para a coluna anterior (rollback)', async () => {
  const { queryClient, items, observer, seen } = setup(async () => {
    throw new Error('falha de rede');
  });
  await assert.rejects(observer.mutate({ tenderId: 'a', previous: items[0], body: { stage: 'participating' } }), /falha de rede/);

  assert.deepEqual(seen[0], [], 'saiu de “Analisando” durante o pedido');
  assert.deepEqual(column(queryClient, 'analyzing'), ['a']);
  assert.deepEqual(column(queryClient, 'participating'), ['b']);
  assert.deepEqual(queryClient.getQueryData(queryKeys.me.savedTenders.everything), items, 'volta exatamente ao estado anterior');
  assert.deepEqual(queryClient.getQueryData<SavedTenderIdsResponse>(queryKeys.me.savedTenders.ids), { saved: ['a', 'b'], monitored: ['b'] });
  const list = queryClient.getQueryData<SavedTendersResponse>(queryKeys.me.savedTenders.list({ page: 1, pageSize: 50 }))!;
  assert.equal(list.data[0].stage, 'analyzing');
});
