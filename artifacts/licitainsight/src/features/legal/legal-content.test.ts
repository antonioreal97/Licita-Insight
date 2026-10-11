import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import { PrivacyPage, TermsPage, LEGAL_DRAFT_NOTICE } from './legal-content';

test('privacy draft covers the controller, operators, rights, cookies, retention and incidents', () => {
  const html = renderToStaticMarkup(createElement(Router, { ssrPath: '/privacidade' }, createElement(PrivacyPage)));
  for (const text of [
    LEGAL_DRAFT_NOTICE,
    '[RAZÃO SOCIAL/CNPJ]',
    '[ENCARREGADO]',
    'contato@pardaldigital.com',
    'Google Analytics 4',
    'OpenAI LLC',
    'TypeSafe AI / Jev',
    'Vercel Inc.',
    'Cloudflare Inc.',
    'Oracle',
    'Brevo',
    'Asaas',
    'transferências internacionais',
    'Configurações',
    'licita_session',
    'ANPD',
    'Dados de fontes públicas',
    'Mapas Culturais',
    'rótulo neutro',
  ]) {
    assert.match(html, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('terms draft explains AI limitations, subscription, acceptable use and privacy', () => {
  const html = renderToStaticMarkup(createElement(Router, { ssrPath: '/termos' }, createElement(TermsPage)));
  assert.match(html, new RegExp(LEGAL_DRAFT_NOTICE));
  assert.match(html, /não substituem o edital/i);
  assert.match(html, /Não envie dados pessoais/i);
  assert.match(html, /Assinatura, pagamento e cancelamento/);
  assert.match(html, /href="\/privacidade"/);
});

test('legal links stay present in every required customer touchpoint', () => {
  for (const relative of [
    '../privacy/cookie-notice.tsx',
    '../auth/auth-page.tsx',
    '../settings/settings-page.tsx',
    '../landing/landing-page.tsx',
    '../../components/app-shell.tsx',
  ]) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /<LegalLinks\b/, `${relative} must render the legal links`);
  }
});
