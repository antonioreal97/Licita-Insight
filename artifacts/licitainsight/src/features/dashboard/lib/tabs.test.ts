import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDashboardTab } from './tabs';

test('a aba Mural vai na URL e o Resumo continua sendo o padrão', () => {
  assert.equal(parseDashboardTab('mural'), 'mural');
  assert.equal(parseDashboardTab(null), 'resumo');
  assert.equal(parseDashboardTab('quadro'), 'resumo');
});
