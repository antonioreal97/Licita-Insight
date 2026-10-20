import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMonths, buildDeadlineEvents, cardDeadline, eventsByDay, monthGrid, spDayKey, weekOf } from './deadline-events';
import { savedTender } from './test-fixtures';

const NOW = new Date('2026-10-20T15:00:00Z'); // 12:00 em Brasília

test('monta os três tipos de prazo, só com as datas que existem', () => {
  const events = buildDeadlineEvents(
    [
      savedTender({
        id: 'a',
        stage: 'participating',
        proposalDeadline: '2026-10-25T12:00:00Z',
        openingAt: '2026-10-21T11:00:00Z',
        nextAction: 'Pedir a CND federal',
        nextActionDeadline: '2026-10-23T20:00:00Z',
      }),
    ],
    NOW,
  );
  assert.deepEqual(
    events.map((event) => [event.kind, event.day, event.clock]),
    [
      ['opening', '2026-10-21', '08:00'],
      ['personal', '2026-10-23', '17:00'],
      ['proposal', '2026-10-25', '09:00'],
    ],
  );
  const personal = events.find((event) => event.kind === 'personal')!;
  assert.equal(personal.note, 'Pedir a CND federal');
  assert.equal(events.find((event) => event.kind === 'proposal')!.note, null);
});

test('usa o dia e a hora de Brasília, não o UTC', () => {
  // 01:30 UTC do dia 22 ainda é dia 21 em Brasília (22:30).
  const [event] = buildDeadlineEvents([savedTender({ id: 'tz', proposalDeadline: '2026-10-22T01:30:00Z' })], NOW);
  assert.equal(event.day, '2026-10-21');
  assert.equal(event.clock, '22:30');
  assert.equal(spDayKey(new Date('2026-10-22T03:00:00Z')), '2026-10-22');
  // Data sem hora fica no próprio dia e não ganha horário inventado.
  const [dateOnly] = buildDeadlineEvents([savedTender({ id: 'd', proposalDeadline: '2026-11-03' })], NOW);
  assert.equal(dateOnly.day, '2026-11-03');
  assert.equal(dateOnly.clock, null);
});

test('item sem data e item em “Não vou participar” ficam fora do calendário', () => {
  const events = buildDeadlineEvents(
    [
      savedTender({ id: 'sem-data' }),
      savedTender({ id: 'invalida', proposalDeadline: 'não é data' }),
      savedTender({ id: 'descartado', stage: 'dismissed', proposalDeadline: '2026-10-25T12:00:00Z', nextActionDeadline: '2026-10-24T12:00:00Z' }),
      savedTender({ id: 'ok', stage: 'completed', proposalDeadline: '2026-10-26T12:00:00Z' }),
    ],
    NOW,
  );
  assert.deepEqual(events.map((event) => event.tenderId), ['ok']);
});

test('marca atraso só quando o prazo ainda é devido na etapa', () => {
  const past = '2026-10-19T12:00:00Z';
  const events = buildDeadlineEvents(
    [
      savedTender({ id: 'analisando', stage: 'analyzing', proposalDeadline: past }),
      savedTender({ id: 'preparando', stage: 'participating', proposalDeadline: past, nextActionDeadline: past }),
      savedTender({ id: 'enviada', stage: 'submitted', proposalDeadline: past, nextActionDeadline: past, openingAt: past }),
      savedTender({ id: 'concluida', stage: 'completed', nextActionDeadline: past }),
      savedTender({ id: 'futuro', stage: 'participating', proposalDeadline: '2026-10-20T15:00:01Z' }),
    ],
    NOW,
  );
  const overdue = (id: string, kind: string) => events.find((event) => event.tenderId === id && event.kind === kind)!.overdue;
  assert.equal(overdue('analisando', 'proposal'), true);
  assert.equal(overdue('preparando', 'proposal'), true);
  assert.equal(overdue('preparando', 'personal'), true);
  assert.equal(overdue('enviada', 'proposal'), false, 'proposta já enviada: o prazo passou, mas não está atrasado');
  assert.equal(overdue('enviada', 'personal'), true, 'prazo pessoal vencido continua pendente');
  assert.equal(overdue('enviada', 'opening'), false);
  assert.equal(overdue('concluida', 'personal'), false);
  assert.equal(overdue('futuro', 'proposal'), false);
  assert.equal(events.find((event) => event.tenderId === 'futuro')!.past, false);
});

test('o cartão mostra o atraso primeiro; senão o prazo futuro mais próximo, sem contar o início das propostas', () => {
  const late = savedTender({ id: 'l', stage: 'participating', proposalDeadline: '2026-10-30T12:00:00Z', nextActionDeadline: '2026-10-18T12:00:00Z' });
  assert.equal(cardDeadline(late, NOW)?.kind, 'personal');
  assert.equal(cardDeadline(late, NOW)?.overdue, true);
  const next = savedTender({ id: 'n', proposalDeadline: '2026-10-30T12:00:00Z', nextActionDeadline: '2026-10-28T12:00:00Z', openingAt: '2026-10-21T12:00:00Z' });
  assert.equal(cardDeadline(next, NOW)?.kind, 'personal');
  const sent = savedTender({ id: 's', stage: 'submitted', proposalDeadline: '2026-10-10T12:00:00Z', openingAt: '2026-10-25T12:00:00Z' });
  assert.equal(cardDeadline(sent, NOW), null);
});

test('agrupa por dia e monta semanas completas de domingo a sábado', () => {
  const events = buildDeadlineEvents([savedTender({ id: 'a', proposalDeadline: '2026-10-25T12:00:00Z', openingAt: '2026-10-25T10:00:00Z' })], NOW);
  assert.equal(eventsByDay(events).get('2026-10-25')?.length, 2);
  assert.deepEqual(weekOf('2026-10-21'), ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']);
  const grid = monthGrid('2026-10-20');
  assert.equal(grid[0][0], '2026-09-27');
  assert.equal(grid.at(-1)!.at(-1), '2026-10-31');
  assert.ok(grid.every((week) => week.length === 7));
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-01-15', -1), '2025-12-15');
});
