import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import { emptyGuidedDraft } from '@/features/guided-onboarding/profile-progress';
import { DashboardProfileCardContent } from './profile-invite-card';

const incomplete = () => ({ ...emptyGuidedDraft(), offerings: ['produção audiovisual'], size: 'me_epp' as const });
const complete = () => ({
  ...incomplete(),
  valueRange: { min: null, max: 50000 },
  registeredPlatforms: ['compras-gov'],
});
const renderCard = (profile: ReturnType<typeof incomplete>, usageInvite: boolean) =>
  renderToStaticMarkup(
    React.createElement(
      Router,
      { ssrPath: '/dashboard' },
      React.createElement(DashboardProfileCardContent, {
        profile,
        usageInvite,
        onStart: () => undefined,
        onDismissUsage: () => undefined,
      }),
    ),
  );

test('cartão único reúne perfil incompleto e finalidade pendente em até três próximos passos', () => {
  const html = renderCard(incomplete(), true);
  assert.equal((html.match(/data-testid="card-dashboard-profile-invite"/g) ?? []).length, 1);
  assert.match(html, /Perfil 60%/);
  assert.match(html, /Completar em 3 minutos/);
  assert.match(html, /Conte o que você busca no Pardal/);
  assert.match(html, /Dispensar/);
  assert.match(html, /Defina a faixa de valor/);
  assert.match(html, /Informe as plataformas/);
});

test('perfil incompleto mantém o cartão quando a finalidade já foi respondida ou dispensada', () => {
  const html = renderCard(incomplete(), false);
  assert.match(html, /Perfil 60%/);
  assert.match(html, /Completar em 3 minutos/);
  assert.doesNotMatch(html, /Conte o que você busca no Pardal/);
});

test('perfil completo mantém somente a finalidade pendente', () => {
  const html = renderCard(complete(), true);
  assert.match(html, /Perfil 100%/);
  assert.match(html, /Perfil completo/);
  assert.match(html, /Conte o que você busca no Pardal/);
  assert.doesNotMatch(html, /Completar em 3 minutos/);
});

test('cartão some com perfil completo e finalidade respondida ou dispensada', () => {
  assert.equal(renderCard(complete(), false), '');
});
