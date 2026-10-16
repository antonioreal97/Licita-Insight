import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileMeter } from './profile-meter';
import {
  emptyGuidedDraft,
  guidedAlertParams,
  guidedProfileInput,
  hasProfileContent,
  profileProgress,
  validateGuidedStep,
} from './profile-progress';
import { dismissGuided, GUIDED_DISMISSAL_KEY, isGuidedDismissed } from './dismissal';
import { setCookieConsent } from '@/features/privacy/cookie-consent';

const filled = () => ({ ...emptyGuidedDraft(), offerings: ['limpeza predial'], size: 'me_epp' as const });

test('medidor: ausência de perfil começa em zero e oferece no máximo três próximos itens úteis', () => {
  const progress = profileProgress(null);
  assert.equal(progress.percent, 0);
  assert.deepEqual(
    progress.next.map((item) => item.key),
    ['terms', 'region', 'value'],
  );
  const html = renderToStaticMarkup(React.createElement(ProfileMeter, { profile: null, onChoose: () => undefined }));
  assert.match(html, /Perfil 0%/);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /encontre editais ligados ao seu trabalho/);
  assert.match(html, /menos editais fora do seu tamanho/);
});

test('medidor: perfil essencial vale 60%, com recompensa concreta para cada lacuna', () => {
  const progress = profileProgress(filled());
  assert.equal(progress.percent, 60);
  assert.deepEqual(
    progress.next.map((item) => item.key),
    ['value', 'platforms'],
  );
  const html = renderToStaticMarkup(React.createElement(ProfileMeter, { profile: filled(), onChoose: () => undefined }));
  assert.match(html, /Perfil 60%/);
  assert.match(html, /identifique quando o edital usar outra plataforma/);
});

test('medidor: 100% tem conclusão discreta e respeita redução de movimento', () => {
  const profile = { ...filled(), valueRange: { min: null, max: 50000 }, registeredPlatforms: ['compras-gov'] };
  assert.deepEqual(profileProgress(profile), { percent: 100, next: [] });
  const html = renderToStaticMarkup(React.createElement(ProfileMeter, { profile }));
  assert.match(html, /Perfil completo/);
  assert.match(html, /motion-safe:transition/);
  assert.doesNotMatch(html, /Complete no seu ritmo/);
});

test('região incompleta não soma pontos; nacional e raio são escolhas válidas', () => {
  const profile = {
    ...filled(),
    coverage: {
      scope: 'custom' as const,
      mode: 'strict' as const,
      acceptsRemote: false,
      regions: [],
      states: [],
      municipalities: [],
      radius: null,
    },
  };
  assert.equal(profileProgress(profile).percent, 40);
  assert.ok(validateGuidedStep(profile, 1));
  assert.equal(validateGuidedStep({ ...profile, coverage: { ...profile.coverage, states: ['SP'] } }, 1), null);
});

test('pular não inventa termos ou porte: salvamento final valida os campos obrigatórios', () => {
  assert.ok(validateGuidedStep(emptyGuidedDraft(), 0));
  assert.ok(validateGuidedStep(emptyGuidedDraft(), 3));
  assert.equal(validateGuidedStep(emptyGuidedDraft(), 2), null);
  assert.ok(validateGuidedStep({ ...filled(), valueRange: { min: 100, max: 10 } }, 2));
  assert.ok(validateGuidedStep({ ...filled(), valueRange: { min: null, max: Infinity } }, 2));
});

test('PUT reaproveita a normalização do campo único e preserva campos fora do guia', () => {
  const profile = {
    ...filled(),
    description: '',
    offerings: [],
    selectedKeywords: ['limpeza predial'],
    exclusions: ['dedetização'],
    excludedKeywords: ['hospitalar'],
    selectedCategories: ['servicos'],
  };
  const input = guidedProfileInput(profile);
  assert.deepEqual(input.offerings, ['limpeza predial']);
  assert.deepEqual(input.selectedKeywords, []);
  assert.equal(input.description, 'A empresa vende ou faz: limpeza predial.');
  assert.deepEqual(input.exclusions, ['dedetização']);
  assert.deepEqual(input.excludedKeywords, ['hospitalar']);
  assert.deepEqual(input.selectedCategories, ['servicos']);
  assert.equal(
    guidedProfileInput({ ...profile, description: 'Descrição já escrita pela empresa.' }).description,
    'Descrição já escrita pela empresa.',
  );
});

test('perfil ausente/vazio recebe convite; perfil com conteúdo não abre automaticamente', () => {
  assert.equal(hasProfileContent(null), false);
  assert.equal(hasProfileContent(emptyGuidedDraft()), false);
  assert.equal(hasProfileContent(filled()), true);
});

test('alerta usa busca por palavra-chave e apenas filtros aceitos por buscas salvas', () => {
  const profile = guidedProfileInput({ ...filled(), valueRange: { min: 1000, max: 50000 } });
  const params = guidedAlertParams(profile);
  assert.equal(params.q, 'limpeza predial');
  assert.equal(params.mode, 'keyword');
  assert.deepEqual(params.status, ['open']);
  assert.equal(params.valueMax, 50000);
  assert.equal(params.myRegion, undefined);
});

test('dispensa isolada por usuário, só persiste com consentimento e é removida ao recusar', () => {
  const storage = new Map<string, string>();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  try {
    dismissGuided('refused-user');
    assert.equal(isGuidedDismissed('refused-user'), true);
    assert.equal(isGuidedDismissed('another-user'), false);
    assert.equal(storage.has(GUIDED_DISMISSAL_KEY), false);
    setCookieConsent('accepted');
    dismissGuided('accepted-user');
    assert.deepEqual(JSON.parse(storage.get(GUIDED_DISMISSAL_KEY)!), ['accepted-user']);
    setCookieConsent('refused');
    assert.equal(storage.has(GUIDED_DISMISSAL_KEY), false);
    assert.equal(isGuidedDismissed('accepted-user'), true);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
