import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Notification } from '@/api/types';
import { notificationDescription, notificationHref, notificationTitle } from './notification-copy';

const profileNotification = (profileMatches: Notification['profileMatches']): Notification => ({
  id: 'profile-1',
  type: 'profile_new_matches',
  createdAt: '2026-09-29T10:00:00.000Z',
  readAt: null,
  tender: null,
  change: null,
  savedSearch: null,
  matchCount: 3,
  newMatchCount: 3,
  tenderIds: [],
  profileMatches,
});

const savedSearchNotification: Notification = {
  id: 'saved-search-1',
  type: 'saved_search_new_matches',
  createdAt: '2026-10-08T10:00:00.000Z',
  readAt: null,
  tender: null,
  change: null,
  savedSearch: { id: 'search-1', name: 'Câmeras', query: 'q=cameras&status=open' },
  matchCount: 4,
  newMatchCount: 3,
  tenderIds: ['one', 'two', 'three', 'old'],
  profileMatches: [],
};

test('um único edital novo para o perfil abre o edital diretamente', () => {
  const notification = profileNotification([{ id: 'tender/1', title: 'Aquisição de servidores', organizationName: 'Órgão de teste', proposalDeadline: null, level: 'high' }]);
  notification.matchCount = 1;
  const href = notificationHref(
    notification,
  );
  assert.equal(href, '/tenders/tender%2F1');
});

test('vários editais novos para o perfil abrem o snapshot da notificação', () => {
  assert.equal(notificationHref(profileNotification([])), '/search?status=all&notification=profile-1');
});

test('alerta de busca salva usa texto neutro e abre somente o snapshot, sem filtros relativos', () => {
  assert.equal(notificationDescription(savedSearchNotification), 'Abra para ver os editais.');
  assert.equal(notificationHref(savedSearchNotification), '/search?status=all&notification=saved-search-1');
});

test('aviso de documento mostra o marco e abre a prontidão', () => {
  const notification: Notification = {
    ...profileNotification([]),
    id: 'document-1',
    type: 'company_document_expiring',
    change: { field: 'companyDocument:cndt', from: 7, to: '2026-10-23' },
    matchCount: null,
    newMatchCount: 0,
  };
  assert.equal(notificationTitle(notification), 'Documento vence em 7 dias');
  assert.equal(notificationDescription(notification), 'CNDT: validade em 23 de out de 2026.');
  assert.equal(notificationHref(notification), '/readiness');
});
