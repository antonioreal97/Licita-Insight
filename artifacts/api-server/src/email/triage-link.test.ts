import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderNotificationEmail } from './email-template';
test('triage link is present in both daily email formats and absent from immediate alerts', () => {
  const input = { origin: 'https://pardal.example', unsubscribeToken: 'test', notifications: [] };
  const digest = renderNotificationEmail({ ...input, mode: 'digest' });
  assert.match(digest.html, /href="https:\/\/pardal.example\/triagem"/);
  assert.match(digest.text, /Fazer minha triagem de editais: https:\/\/pardal.example\/triagem/);
  const immediate = renderNotificationEmail({ ...input, mode: 'immediate' });
  assert.doesNotMatch(immediate.html, /\/triagem/);
  assert.doesNotMatch(immediate.text, /\/triagem/);
});

test('workspace digest carries the notification workspace in its triage link', () => {
  const workspaceId = 'ws_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const digest = renderNotificationEmail({
    origin: 'https://pardal.example',
    unsubscribeToken: 'test',
    notifications: [],
    mode: 'digest',
    workspaceId,
  });
  assert.match(digest.html, new RegExp(`/triagem\\?workspaceId=${workspaceId}`));
  assert.match(digest.text, new RegExp(`/triagem\\?workspaceId=${workspaceId}`));
});
