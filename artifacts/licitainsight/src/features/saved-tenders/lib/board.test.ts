import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STAGE_LABELS, STAGE_ORDER } from '@/features/participation/lib/stages';
import { BOARD_COLUMNS, groupByStage } from './board';
import { savedTender } from './test-fixtures';

const NOW = new Date('2026-10-20T15:00:00Z');

test('uma coluna por etapa, na ordem de STAGE_ORDER, com “Não vou participar” no fim', () => {
  const columns = groupByStage([], NOW);
  assert.deepEqual(
    columns.map((column) => column.stage),
    STAGE_ORDER,
  );
  assert.equal(columns.at(-1)!.stage, 'dismissed');
  assert.equal(STAGE_LABELS[columns.at(-1)!.stage], 'Não vou participar');
  assert.ok(!BOARD_COLUMNS.includes('dismissed'));
  assert.ok(columns.every((column) => column.items.length === 0), 'colunas vazias continuam no quadro');
});

test('cada edital cai na coluna da sua etapa', () => {
  const items = [
    savedTender({ id: 'a', stage: 'analyzing' }),
    savedTender({ id: 'b', stage: 'participating' }),
    savedTender({ id: 'c', stage: 'awaiting_result' }),
    savedTender({ id: 'd', stage: 'dismissed' }),
    savedTender({ id: 'e', stage: 'participating' }),
  ];
  const ids = Object.fromEntries(groupByStage(items, NOW).map((column) => [column.stage, column.items.map((item) => item.tender.id)]));
  assert.deepEqual(ids, { analyzing: ['a'], participating: ['b', 'e'], submitted: [], awaiting_result: ['c'], completed: [], dismissed: ['d'] });
});

test('dentro da coluna: atrasados, depois o prazo mais próximo, depois sem prazo (salvo mais recente primeiro)', () => {
  const items = [
    savedTender({ id: 'sem-prazo-antigo', savedAt: '2026-09-01T12:00:00Z' }),
    savedTender({ id: 'longe', proposalDeadline: '2026-11-30T12:00:00Z' }),
    savedTender({ id: 'atrasado', proposalDeadline: '2026-10-19T12:00:00Z' }),
    savedTender({ id: 'perto', nextActionDeadline: '2026-10-21T12:00:00Z' }),
    savedTender({ id: 'sem-prazo-novo', savedAt: '2026-10-10T12:00:00Z' }),
  ];
  const [analyzing] = groupByStage(items, NOW);
  assert.deepEqual(
    analyzing.items.map((item) => item.tender.id),
    ['atrasado', 'perto', 'longe', 'sem-prazo-novo', 'sem-prazo-antigo'],
  );
  assert.equal(items[0].tender.id, 'sem-prazo-antigo', 'não reordena a lista recebida');
});
