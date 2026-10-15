import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OpportunityApplication } from '@/api';
import { NO_APPLICATION_TEXT, UNREAD_APPLICATION_TEXT, applicationBadgeText, closesAtStatedHour, registrationDates } from '../lib/application';
import { ApplicationBadge, ApplicationPanel } from './application-panel';

const SOURCE = 'https://www.gov.br/capes/pt-br/centrais-de-conteudo/editais/edital_2844920.pdf/@@display-file/file';
const sucupira: OpportunityApplication = {
  url: 'https://sucupira.capes.gov.br/apcn/submissao-de-proposta',
  platform: 'sucupira',
  label: 'Plataforma Sucupira',
  article: 'a',
  origin: 'document',
  documentTitle: 'Chamada Pública para Envio de Proposta de Curso Novo - Edital nº 20/2026',
};

const panel = (props: Parameters<typeof ApplicationPanel>[0]['opportunity']) =>
  renderToStaticMarkup(createElement(ApplicationPanel, { opportunity: props }));

test('com plataforma: botão "Inscrever-se na Plataforma Sucupira", origem no edital e a fonte como ação secundária', () => {
  const markup = panel({ application: sucupira, applicationCheckedAt: '2026-10-14T12:00:00Z', sourceUrl: SOURCE });
  assert.match(markup, /Onde se inscrever/);
  assert.match(markup, /Inscrever-se na Plataforma Sucupira/);
  assert.match(markup, /href="https:\/\/sucupira.capes.gov.br\/apcn\/submissao-de-proposta"/);
  assert.match(markup, /Indicado no edital: Chamada Pública para Envio de Proposta de Curso Novo - Edital nº 20\/2026/);
  assert.match(markup, /Ver edital na fonte/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.match(markup, /\(abre em nova aba\)/);
  // A inscrição é a ação principal (lima); a fonte vem depois, com contorno.
  assert.ok(markup.indexOf('link-opportunity-application') < markup.indexOf('link-opportunity-source'));
  assert.doesNotMatch(markup, new RegExp(NO_APPLICATION_TEXT));
});

test('plataforma com artigo masculino e link que é a própria página da chamada', () => {
  const mapas = 'https://mapacultural.secult.ce.gov.br/oportunidade/7688/';
  const markup = panel({
    application: { url: mapas, platform: 'mapas-culturais', label: 'Mapas Culturais', article: 'o', origin: 'source_page', documentTitle: null },
    applicationCheckedAt: '2026-10-14T12:00:00Z',
    sourceUrl: mapas,
  });
  assert.match(markup, /Inscrever-se no Mapas Culturais/);
  assert.match(markup, /na própria página da chamada/);
});

test('link sem plataforma conhecida mostra o endereço; sem link, o texto certo para lido e não lido', () => {
  const other = panel({
    application: { url: 'https://inscricoes.festival.org.br/2026', platform: null, label: null, article: null, origin: 'document', documentTitle: 'Edital' },
    applicationCheckedAt: '2026-10-14T12:00:00Z',
    sourceUrl: SOURCE,
  });
  assert.match(other, /Abrir o link de inscrição/);
  assert.match(other, /inscricoes\.festival\.org\.br/);

  const read = panel({ application: null, applicationCheckedAt: '2026-10-14T12:00:00Z', sourceUrl: SOURCE });
  assert.match(read, new RegExp(NO_APPLICATION_TEXT));
  assert.doesNotMatch(read, /link-opportunity-application/);
  assert.match(read, /Ver edital na fonte/);

  const unread = panel({ application: null, applicationCheckedAt: null, sourceUrl: SOURCE });
  assert.match(unread, new RegExp(UNREAD_APPLICATION_TEXT));
});

test('selo discreto da lista: só com plataforma conhecida', () => {
  assert.equal(applicationBadgeText(sucupira), 'Inscrição pela Plataforma Sucupira');
  assert.equal(applicationBadgeText({ ...sucupira, label: 'Salic', article: 'o' }), 'Inscrição pelo Salic');
  assert.equal(applicationBadgeText({ ...sucupira, label: null, platform: null, article: null }), null);
  assert.equal(renderToStaticMarkup(createElement(ApplicationBadge, { application: null })), '');
  assert.match(renderToStaticMarkup(createElement(ApplicationBadge, { application: sucupira })), /Inscrição pela Plataforma Sucupira/);
});

test('datas do edital só quando a fonte não traz as suas', () => {
  const notice = { registrationFrom: '2026-08-24T03:00:00.000Z', registrationTo: '2026-12-18T21:00:00.000Z', origin: 'document' as const, documentTitle: 'Edital' };
  assert.deepEqual(registrationDates({ registrationFrom: null, registrationTo: null, noticeDates: notice }), {
    from: notice.registrationFrom,
    to: notice.registrationTo,
    fromNotice: true,
  });
  assert.deepEqual(registrationDates({ registrationFrom: null, registrationTo: '2026-11-30T23:59:59-03:00', noticeDates: notice }), {
    from: null,
    to: '2026-11-30T23:59:59-03:00',
    fromNotice: false,
  });
  assert.deepEqual(registrationDates({ registrationFrom: null, registrationTo: null }), { from: null, to: null, fromNotice: false });
});

test('encerramento do edital com hora declarada mostra a hora; fim do dia não', () => {
  assert.equal(closesAtStatedHour('2026-12-18T21:00:00.000Z'), true);
  assert.equal(closesAtStatedHour('2026-12-12T02:59:59.000Z'), false);
  assert.equal(closesAtStatedHour(null), false);
});
