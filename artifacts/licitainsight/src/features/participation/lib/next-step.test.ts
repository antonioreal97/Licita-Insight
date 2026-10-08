import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextStep } from './next-step';

const now = new Date('2026-09-28T12:00:00-03:00');
const future = '2026-10-03T10:00:00-03:00';
const past = '2026-09-27T10:00:00-03:00';
const open = { status: 'open' as const, proposalDeadline: future, openingAt: past, monitored: false, stage: null, stageAt: null };
const markedAt = '2026-09-26T09:30:00-03:00';

const PORTALS = /compras\.gov|comprasnet|bll|licitações-e|bnc|portal de compras/i;
const FORBIDDEN = /\bapto\b|habilitad|pode participar|cumpre|confirmado|inscrito|proposta aceita|vale a pena|recomendado|aguardando resultado do órgão/i;

test('regra 1: revogada, mesmo com prazo futuro', () => {
  const step = nextStep({ ...open, status: 'cancelled' }, now);
  assert.equal(step.rule, 1);
  assert.equal(step.title, 'O órgão revogou esta licitação.');
  assert.deepEqual(step.details, ['Dado oficial da fonte.']);
});

test('regra 2: suspensa; a secundária depende do monitoramento', () => {
  assert.deepEqual(nextStep({ ...open, status: 'suspended', monitored: true }, now), {
    rule: 2,
    title: 'O órgão suspendeu esta licitação.',
    details: ['Avisamos aqui quando houver nova data.'],
    withDeadline: false,
    askSubmitted: false,
  });
  assert.deepEqual(nextStep({ ...open, status: 'suspended' }, now).details, ['Monitore para ser avisado da nova data.']);
});

test('regra 3: encerrada na fonte; a secundária só aparece se o usuário marcou envio', () => {
  const step = nextStep({ ...open, status: 'closed', proposalDeadline: past }, now);
  assert.equal(step.rule, 3);
  assert.equal(step.title, 'Licitação encerrada na fonte.');
  assert.deepEqual(step.details, []);
  for (const stage of ['submitted', 'awaiting_result'] as const) {
    assert.deepEqual(nextStep({ ...open, status: 'closed', stage, stageAt: markedAt }, now).details, [
      'Você marcou que enviou proposta. Consulte o resultado no portal oficial.',
    ]);
  }
});

test('regra 4: prazo não publicado', () => {
  const step = nextStep({ ...open, proposalDeadline: null }, now);
  assert.equal(step.rule, 4);
  assert.equal(step.title, 'A fonte não publicou o prazo de propostas.');
  assert.deepEqual(step.details, ['Confira a data no edital.']);
});

test('regra 5: prazo vencido com status ainda ativo não muda o status, só avisa', () => {
  for (const status of ['open', 'under_review'] as const) {
    const step = nextStep({ ...open, status, proposalDeadline: past }, now);
    assert.equal(step.rule, 5);
    assert.equal(step.title, 'O prazo de propostas publicado terminou em 27 de set de 2026, 10:00.');
    assert.deepEqual(step.details, ['A situação na fonte pode demorar a mudar.']);
    assert.equal(step.askSubmitted, false);
  }
});

test('regra 5: o prazo que vence exatamente agora já terminou', () => {
  assert.equal(nextStep({ ...open, proposalDeadline: now.toISOString() }, now).rule, 5);
});

test('regra 5 + F5: só pergunta se enviou quando a etapa é "Preparando documentos"', () => {
  const ask = (stage: 'analyzing' | 'participating' | 'submitted' | 'dismissed') =>
    nextStep({ ...open, proposalDeadline: past, stage, stageAt: markedAt }, now).askSubmitted;
  assert.equal(ask('participating'), true);
  assert.equal(ask('analyzing'), false);
  assert.equal(ask('submitted'), false);
  assert.equal(ask('dismissed'), false);
});

test('regra 5: envio marcado ganha a secundária do resultado no portal oficial', () => {
  const step = nextStep({ ...open, proposalDeadline: past, stage: 'awaiting_result', stageAt: markedAt }, now);
  assert.deepEqual(step.details, ['A situação na fonte pode demorar a mudar.', 'Você marcou que enviou proposta. O resultado sai no portal oficial.']);
});

test('regra 6: recebimento ainda não começou (openingAt é início das propostas, não a sessão)', () => {
  const step = nextStep({ ...open, openingAt: '2026-09-30T08:00:00-03:00' }, now);
  assert.equal(step.rule, 6);
  assert.equal(step.title, 'O recebimento de propostas começa em 30 de set de 2026, 08:00.');
  assert.deepEqual(step.details, ['Prazo final: 03 de out de 2026, 10:00.']);
  assert.equal(step.withDeadline, false);
});

test('regra 7: envio marcado pelo usuário com prazo futuro, com data da marcação', () => {
  const step = nextStep({ ...open, stage: 'submitted', stageAt: markedAt }, now);
  assert.equal(step.rule, 7);
  assert.equal(step.title, 'Você marcou que enviou proposta em 26 de set de 2026, 09:30.');
  assert.deepEqual(step.details, ['O resultado sai no portal oficial. Monitore para ser avisado se o status mudar.']);
  assert.deepEqual(nextStep({ ...open, stage: 'awaiting_result', stageAt: markedAt, monitored: true }, now).details, [
    'O resultado sai no portal oficial. Avisamos aqui se o status mudar.',
  ]);
});

test('regra 8: prazo futuro com recebimento aberto ou sem data de início', () => {
  for (const openingAt of [past, null]) {
    const step = nextStep({ ...open, openingAt }, now);
    assert.equal(step.rule, 8);
    assert.equal(step.title, 'Envie a proposta até 03 de out de 2026, 10:00.');
    assert.deepEqual(step.details, ['O envio é feito no sistema indicado no edital, não pelo Pardal Digital.']);
    assert.equal(step.withDeadline, true);
  }
});

test('regra 8: "Analisando" pede decisão antes do prazo', () => {
  assert.deepEqual(nextStep({ ...open, stage: 'analyzing', stageAt: markedAt }, now).details, [
    'O envio é feito no sistema indicado no edital, não pelo Pardal Digital.',
    'Decida antes disso.',
  ]);
});

test('nenhuma frase nomeia portal nem promete participação', () => {
  const stages = [null, 'analyzing', 'participating', 'submitted', 'awaiting_result', 'completed', 'dismissed'] as const;
  const variants = [
    { status: 'cancelled' as const },
    { status: 'suspended' as const },
    { status: 'suspended' as const, monitored: true },
    { status: 'closed' as const },
    { proposalDeadline: null },
    { proposalDeadline: past },
    { openingAt: '2026-09-30T08:00:00-03:00' },
    {},
  ];
  for (const stage of stages) {
    for (const variant of variants) {
      const text = (({ title, details }) => [title, ...details].join(' '))(nextStep({ ...open, ...variant, stage, stageAt: stage ? markedAt : null }, now));
      assert.doesNotMatch(text, PORTALS);
      assert.doesNotMatch(text, FORBIDDEN);
    }
  }
});
