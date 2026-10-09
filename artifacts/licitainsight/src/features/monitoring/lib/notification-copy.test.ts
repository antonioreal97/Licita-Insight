import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Notification } from '@/api/types';
import { notificationDescription, notificationHref } from './notification-copy';

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

test('editais novos para o perfil abrem o primeiro edital encontrado', () => {
  const href = notificationHref(
    profileNotification([{ id: 'tender/1', title: 'Aquisição de servidores', organizationName: 'Órgão de teste', proposalDeadline: null, level: 'high' }]),
  );
  assert.equal(href, '/tenders/tender%2F1');
});

test('sem edital em destaque, o link de perfil abre a busca com todos os status', () => {
  assert.equal(notificationHref(profileNotification([])), '/search?status=all');
});

test('alerta de busca salva informa quantos ainda são novos e abre o filtro de novos', () => {
  assert.equal(notificationDescription(savedSearchNotification), '3 resultados entraram no Pardal nas últimas 24 horas.');
  assert.equal(notificationHref(savedSearchNotification), '/search?q=cameras&status=open&newOnly=true');
});
