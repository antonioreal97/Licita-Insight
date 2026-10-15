import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queryKeys, scopedMeQueryKeys } from './query-keys';

test('jornadas desligadas preservam exatamente as chaves legadas', () => {
  const keys = scopedMeQueryKeys();
  assert.deepEqual(keys.companyProfile, ['me', 'company-profile']);
  assert.deepEqual(keys.companyProfile, queryKeys.me.companyProfile);
  assert.deepEqual(keys.savedTenders.ids, ['me', 'saved-tenders', 'ids']);
  assert.deepEqual(keys.savedTenders.list({ page: 1 }), ['me', 'saved-tenders', 'list', { page: 1 }]);
  assert.deepEqual(keys.savedSearches, ['me', 'saved-searches']);
  assert.deepEqual(keys.notifications.list({ page: 1 }), ['me', 'notifications', 'list', { page: 1 }]);
  assert.deepEqual(keys.notifications.unreadCount, ['me', 'notifications', 'unread-count']);
  assert.deepEqual(keys.recommendations, ['me', 'recommendations']);
  assert.deepEqual(keys.tenderHighlights(['b', 'a', 'b']), ['me', 'tender-highlights', ['a', 'b']]);
});

test('jornadas ligadas isolam todos os caches contextuais por workspaceId', () => {
  const workspaceId = 'ws_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const keys = scopedMeQueryKeys(workspaceId);
  const prefix = ['me', 'workspace', workspaceId];
  assert.deepEqual(keys.companyProfile, [...prefix, 'company-profile']);
  assert.deepEqual(keys.companyRegionPreview, [...prefix, 'company-region-preview']);
  assert.deepEqual(keys.fit.batch(['b', 'a']), [...prefix, 'fit', ['a', 'b']]);
  assert.deepEqual(keys.savedTenders.ids, [...prefix, 'saved-tenders', 'ids']);
  assert.deepEqual(keys.savedSearches, [...prefix, 'saved-searches']);
  assert.deepEqual(keys.notifications.unreadCount, [...prefix, 'notifications', 'unread-count']);
  assert.deepEqual(keys.recommendations, [...prefix, 'recommendations']);
  assert.deepEqual(keys.tenderHighlights(['b', 'a']), [...prefix, 'tender-highlights', ['a', 'b']]);
});
