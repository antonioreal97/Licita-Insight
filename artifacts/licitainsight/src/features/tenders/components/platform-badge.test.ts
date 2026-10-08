import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TenderPlatform } from '@/api';
import { missingRegistration } from '../lib/platform';
import { PlatformBadge } from './platform-badge';

const licitanet: TenderPlatform = { slug: 'licitanet', label: 'Licitanet', kind: 'platform', url: 'https://licitanet.com.br' };
const ipm: TenderPlatform = { slug: 'origem-ipm-sistemas', label: 'Sistema de origem: IPM Sistemas', kind: 'source_system', url: null };

const render = (props: Parameters<typeof PlatformBadge>[0]) => renderToStaticMarkup(createElement(PlatformBadge, props));

test('mostra "Disputa em" com link para a plataforma conhecida', () => {
  const markup = render({ platform: licitanet, registeredPlatforms: [] });
  assert.match(markup, /Disputa em: Licitanet/);
  assert.match(markup, /href="https:\/\/licitanet.com.br"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.doesNotMatch(markup, /ainda não é cadastrado/);
});

test('avisa quando o perfil declara plataformas e esta não está entre elas', () => {
  assert.match(render({ platform: licitanet, registeredPlatforms: ['bll', 'sicaf'] }), /Você ainda não é cadastrado nesta plataforma/);
  assert.doesNotMatch(render({ platform: licitanet, registeredPlatforms: ['licitanet'] }), /ainda não é cadastrado/);
  assert.equal(missingRegistration(ipm, ['bll']), false);
  assert.equal(missingRegistration(null, ['bll']), false);
});

test('no card, sistema de origem não vira "Disputa em"; no detalhe, aparece com a explicação', () => {
  assert.equal(render({ platform: ipm, registeredPlatforms: ['bll'] }), '');
  const detail = render({ platform: ipm, registeredPlatforms: ['bll'], variant: 'detail' });
  assert.match(detail, /Sistema de origem: IPM Sistemas/);
  assert.match(detail, /A sala de disputa não foi identificada/);
  assert.doesNotMatch(detail, /Disputa em/);
  assert.doesNotMatch(detail, /href=/);
});

test('sem plataforma no edital, não renderiza nada', () => {
  assert.equal(render({ platform: null, registeredPlatforms: [], variant: 'detail' }), '');
  assert.equal(render({ platform: undefined, registeredPlatforms: [] }), '');
});
