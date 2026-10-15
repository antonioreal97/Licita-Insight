import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Router } from 'wouter';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Recommendation } from '@/api';
import { advanceProgress, dismissalMessage, DISMISS_LABELS, emptyProgress, shortcutAction, suggestedExclusion, swipeAction, triageDay } from './triage-state';
import { TriageCard } from './triage-card';
const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(Router, { ssrPath: '/triagem' }, element));
const recommendation = { tender: { id: 'triage-1', title: 'Contratação de serviços de filmagem', displayTitle: 'Serviços de filmagem', organization: { name: 'Prefeitura de teste' }, location: { city: 'Rio de Janeiro', state: 'RJ' }, proposalDeadline: null, estimatedValue: 100000, categories: [] }, reasons: [{ kind: 'profile', text: 'Ligado a filmagem no seu perfil' }] } as Recommendation;
test('daily goal counts choices once, separates interests and skips, and stops at ten', () => {
  let progress = emptyProgress();
  progress = advanceProgress(progress, '1', 'interest');
  assert.deepEqual(advanceProgress(progress, '1', 'interest'), progress);
  progress = advanceProgress(progress, '2', 'dismiss');
  progress = advanceProgress(progress, '3', 'skip');
  assert.deepEqual(progress, { reviewed: ['1', '2', '3'], interested: 1, skipped: 1 });
  for (let i = 4; i <= 11; i++) progress = advanceProgress(progress, String(i), 'interest');
  assert.equal(progress.reviewed.length, 10);
  assert.equal(progress.interested, 8);
  assert.equal(triageDay(new Date('2026-10-16T02:59:59Z')), '2026-10-15');
  assert.equal(triageDay(new Date('2026-10-16T03:00:00Z')), '2026-10-16');
});
test('keyboard ignores editing, controls, modifiers and unrelated keys', () => {
  assert.equal(shortcutAction('ArrowLeft', false), 'dismiss');
  assert.equal(shortcutAction('ArrowRight', false), 'interest');
  assert.equal(shortcutAction('ArrowDown', false), 'skip');
  assert.equal(shortcutAction('ArrowRight', true), null);
  assert.equal(shortcutAction('ArrowRight', false, true), null);
  assert.equal(shortcutAction('Enter', false), null);
});
test('mobile horizontal gestures have distance/direction thresholds and preserve scrolling', () => {
  assert.equal(swipeAction(120, 10), 'interest');
  assert.equal(swipeAction(-120, 10), 'dismiss');
  assert.equal(swipeAction(60, 0), null);
  assert.equal(swipeAction(100, 90), null);
  assert.equal(swipeAction(20, 300), null);
});
test('reasons explain the concrete signal and suggest a term for explicit confirmation', () => {
  assert.equal(Object.keys(DISMISS_LABELS).length, 4);
  assert.match(dismissalMessage('region', recommendation.tender), /menos editais em RJ/);
  assert.match(dismissalMessage('value', recommendation.tender), /valor próximo/);
  assert.match(dismissalMessage('deadline', recommendation.tender), /3 dias/);
  assert.equal(suggestedExclusion(recommendation.tender), 'filmagem');
});
test('card exposes the essentials, accessible button alternatives and no more than 3 requirements', () => {
  const html = render(createElement(TriageCard, { recommendation, registeredPlatforms: [], busy: false, onAction() {}, onOpen() {}, highlights: { requirements: ['Atestado técnico', 'Equipe', 'Registro', 'Quarta exigência'].map(label => ({ label, kind: 'other' })) } as never }));
  for (const text of ['Serviços de filmagem', 'Prefeitura de teste', 'Rio de Janeiro', '100.000', 'Ligado a filmagem', 'Abrir edital', 'Não interessa', 'Interessa', 'Pular por agora', 'Atestado técnico']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /Quarta exigência/);
  assert.match(html, /aria-labelledby="triage-tender-title"/);
  assert.match(html, /touch-action:pan-y/);
  const busy = render(createElement(TriageCard, { recommendation, registeredPlatforms: [], busy: true, onAction() {}, onOpen() {} }));
  assert.equal((busy.match(/disabled=""/g) ?? []).length, 3);
});
