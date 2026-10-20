import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement as h, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { savedTender } from '../lib/test-fixtures';
import { parseView, viewHref } from '../lib/view';
import { DeadlineBadge } from './deadline-badge';
import { DeadlineCalendar } from './deadline-calendar';
import { MoveStageMenu } from './move-stage-menu';
import { PipelineBoard } from './pipeline-board';

const render = (node: ReactNode) =>
  renderToStaticMarkup(h(QueryClientProvider, { client: new QueryClient() }, h(Router, { ssrPath: '/saved-tenders' }, node)));

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

test('“Mover para…” é um botão de menu ligado ao título do cartão', () => {
  const html = render(h(MoveStageMenu, { tenderId: 't1', stage: 'analyzing', pending: false, describedBy: 'board-title-t1', onMove: () => undefined }));
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-describedby="board-title-t1"/);
  assert.match(html, /Mover para…/);
});

test('cada tipo de prazo tem rótulo e ícone próprios; atraso é escrito', () => {
  const proposal = render(h(DeadlineBadge, { kind: 'proposal' }));
  const personal = render(h(DeadlineBadge, { kind: 'personal' }));
  const late = render(h(DeadlineBadge, { kind: 'opening', overdue: true }));
  assert.match(proposal, /Envio da proposta/);
  assert.match(render(h(DeadlineBadge, { kind: 'opening' })), /Início das propostas/);
  assert.match(personal, /Prazo pessoal/);
  assert.match(personal, /border-dashed/, 'prazo pessoal se distingue também pela borda');
  assert.match(late, /Atrasado · Início das propostas/);
  assert.match(late, /data-overdue="true"/);
});

test('o quadro mostra todas as colunas, com “Não vou participar” recolhida no fim', () => {
  const html = render(
    h(PipelineBoard, {
      items: [
        savedTender({ id: 'a', stage: 'participating', proposalDeadline: inDays(3), nextAction: 'Juntar atestados' }),
        savedTender({ id: 'd', stage: 'dismissed' }),
      ],
    }),
  );
  const order = [...html.matchAll(/data-testid="board-column-(\w+)"/g)].map((match) => match[1]);
  assert.deepEqual(order, ['analyzing', 'participating', 'submitted', 'awaiting_result', 'completed', 'dismissed']);
  assert.match(html, /aria-expanded="false" aria-controls="board-list-dismissed"/);
  assert.match(html, /id="board-list-dismissed" hidden=""/);
  assert.match(html, /href="\/tenders\/a"/);
  assert.match(html, /Juntar atestados/);
  assert.match(html, /Envio da proposta/);
  assert.match(html, /role="region" aria-label="Quadro por etapa" tabindex="0"/);
});

test('o calendário lista atrasados e marca o dia de hoje', () => {
  const html = render(
    h(DeadlineCalendar, {
      items: [
        savedTender({ id: 'late', stage: 'participating', nextAction: 'Pedir CND', nextActionDeadline: inDays(-2) }),
        savedTender({ id: 'gone', stage: 'dismissed', proposalDeadline: inDays(1) }),
      ],
    }),
  );
  assert.match(html, /Atrasados \(1\)/);
  assert.match(html, /data-testid="calendar-event-late:personal"/);
  assert.doesNotMatch(html, /gone:/);
  assert.match(html, /\(hoje\)/);
  assert.match(html, /<th scope="col" abbr="domingo"/);
});

test('a vista vai na URL e a lista continua sendo o padrão', () => {
  assert.equal(parseView(null), 'list');
  assert.equal(parseView('board'), 'board');
  assert.equal(parseView('calendar'), 'calendar');
  assert.equal(parseView('kanban'), 'list');
  assert.equal(viewHref('list'), '/saved-tenders');
  assert.equal(viewHref('calendar'), '/saved-tenders?view=calendar');
});
