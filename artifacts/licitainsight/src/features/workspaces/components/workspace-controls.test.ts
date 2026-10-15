import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import { shouldLoadWorkspaces } from '../workspace-scope';
import type { WorkspaceSummary } from '../workspace-types';
import {
  accessExpiry,
  canCreateWorkspace,
  downgradePlan,
  WorkspaceDowngradeNotice,
  WorkspaceFeatureSurface,
  WorkspaceOnboardingForm,
  WorkspaceSelector,
} from './workspace-controls';

const workspace = (slot: number, overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary => ({
  id: `ws_${String(slot).padStart(32, '0')}`,
  type: 'procurement',
  name: `Espaço ${slot}`,
  slot,
  role: 'owner',
  accessMode: 'write',
  onboardingStatus: 'complete',
  profileCompleteness: 100,
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

test('FEATURE_JOURNEYS vazia não habilita a rota nem renderiza superfície nova', () => {
  assert.equal(shouldLoadWorkspaces('authenticated', []), false);
  assert.equal(shouldLoadWorkspaces('anonymous', ['procurement']), false);
  assert.equal(renderToStaticMarkup(createElement(WorkspaceFeatureSurface, { available: false }, createElement('span', null, 'Espaços'))), '');
});

test('seletor identifica Espaço ativo, tipo e somente leitura sem impedir seleção', () => {
  const rows = [workspace(1), workspace(2, { type: 'culture', name: 'Cinema', accessMode: 'read_only' })];
  const html = renderToStaticMarkup(
    createElement(WorkspaceSelector, {
      workspaces: rows,
      activeWorkspaceId: rows[0].id,
      canCreate: false,
      onSelect: () => undefined,
      onCreate: () => undefined,
    }),
  );
  assert.match(html, /aria-label="Espaço ativo"/);
  assert.match(html, /Ativo · Compras públicas · Espaço 1/);
  assert.match(html, /Cultura · Cinema · Somente leitura/);
  assert.match(html, /Limite de Espaços atingido/);
});

test('onboarding mínimo pede tipo e nome e informa o limite', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceOnboardingForm, {
      types: ['funding', 'culture'],
      limitLabel: '2 de 5 Espaços em uso.',
      submitting: false,
      onSubmit: () => undefined,
    }),
  );
  assert.match(html, /<form[^>]*data-testid="form-workspace-onboarding"/);
  assert.match(html, /<label[^>]*for="workspace-type"/);
  assert.match(html, /<label[^>]*for="workspace-name"/);
  assert.match(html, /2 de 5 Espaços em uso/);
  assert.doesNotMatch(html, /Estudo/);
  assert.equal(canCreateWorkspace({ used: 1, maximum: 1 }, ['procurement']), false);
  assert.equal(canCreateWorkspace({ used: 4, maximum: 5 }, ['procurement']), true);
});

test('aviso de downgrade preserva o menor slot e nomeia os excedentes', () => {
  const rows = [workspace(3, { name: 'Terceiro' }), workspace(1, { name: 'Primeiro' }), workspace(2, { name: 'Segundo' })];
  const plan = downgradePlan(rows);
  assert.equal(plan.writable?.name, 'Primeiro');
  assert.deepEqual(plan.readOnly.map(({ name }) => name), ['Segundo', 'Terceiro']);
  const html = renderToStaticMarkup(
    createElement(WorkspaceDowngradeNotice, {
      workspaces: rows,
      expiresAt: '2026-11-01T12:00:00.000Z',
      now: new Date('2026-10-14T12:00:00.000Z'),
    }),
  );
  assert.match(html, /“Primeiro” continuará gravável/);
  assert.match(html, /“Segundo”, “Terceiro”/);
  assert.match(html, /sem excluir nada/);
});

test('aviso usa apenas vencimentos que realmente encerram o entitlement', () => {
  assert.equal(
    accessExpiry({ status: 'none', entitled: true, source: 'trial', trialEndsAt: '2026-11-01T00:00:00.000Z', currentPeriodEnd: null, canCancel: false, monthlyBrl: 49 }),
    '2026-11-01T00:00:00.000Z',
  );
  assert.equal(
    accessExpiry({ status: 'active', entitled: true, source: 'subscription', currentPeriodEnd: '2026-11-01T00:00:00.000Z', canCancel: true, monthlyBrl: 49 }),
    null,
  );
  assert.equal(
    accessExpiry({ status: 'canceled', entitled: true, source: 'subscription', currentPeriodEnd: '2026-11-01T00:00:00.000Z', canCancel: false, monthlyBrl: 49 }),
    '2026-11-01T00:00:00.000Z',
  );
});
