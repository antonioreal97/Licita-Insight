import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import { ChipGroup, PURPOSE_OPTIONS, APPLICANT_OPTIONS } from './usage-profile-section';
import { shouldShowUsageInvite } from '../../dashboard/dashboard-page';

test('formulário mantém escolhas múltiplas e checkboxes acessíveis', () => {
  const html = renderToStaticMarkup(createElement(ChipGroup, {
    legend: 'Para que você vai usar o Pardal?', options: PURPOSE_OPTIONS,
    selected: ['culture', 'funding'], onChange: () => undefined,
  }));
  assert.match(html, /<fieldset>/);
  assert.match(html, /<legend[^>]*>Para que você vai usar o Pardal/);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 5);
  assert.equal((html.match(/checked=""/g) ?? []).length, 2);
  const applicant = renderToStaticMarkup(createElement(ChipGroup, {
    legend: 'Você participa como', options: APPLICANT_OPTIONS,
    selected: ['individual', 'mei'], onChange: () => undefined,
  }));
  assert.equal((applicant.match(/checked=""/g) ?? []).length, 2);
});

test('convite some após resposta ou dispensa na conta', () => {
  assert.equal(shouldShowUsageInvite({ usagePurposes: [], applicantTypes: [], usageInviteDismissed: false }), true);
  assert.equal(shouldShowUsageInvite({ usagePurposes: ['culture'], applicantTypes: [], usageInviteDismissed: false }), false);
  assert.equal(shouldShowUsageInvite({ usagePurposes: [], applicantTypes: ['mei'], usageInviteDismissed: false }), false);
  assert.equal(shouldShowUsageInvite({ usagePurposes: [], applicantTypes: [], usageInviteDismissed: true }), false);
});
