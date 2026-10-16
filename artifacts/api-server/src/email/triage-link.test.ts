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
