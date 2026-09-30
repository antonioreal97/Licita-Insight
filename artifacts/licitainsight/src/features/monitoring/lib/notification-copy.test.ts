import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Notification } from '@/api/types';
import { notificationHref } from './notification-copy';

const profileNotification = (profileMatches: Notification['profileMatches']): Notification => ({
  id: 'profile-1',
  type: 'profile_new_matches',
  createdAt: '2026-09-29T10:00:00.000Z',
  readAt: null,
  tender: null,
  change: null,
  savedSearch: null,
  matchCount: 3,
  tenderIds: [],
  profileMatches,
});

test('editais novos para o perfil abrem o primeiro edital encontrado', () => {
  const href = notificationHref(
    profileNotification([{ id: 'tender/1', title: 'Aquisição de servidores', organizationName: 'Órgão de teste', proposalDeadline: null, level: 'high' }]),
  );
  assert.equal(href, '/tenders/tender%2F1');
});

test('sem edital em destaque, o link de perfil abre a busca com todos os status', () => {
  assert.equal(notificationHref(profileNotification([])), '/search?status=all');
});
