import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./company-profile-section.tsx', import.meta.url), 'utf8');

test('perfil expõe todos os controles acessíveis da região de atendimento', () => {
  for (const copy of [
    'Onde você atende',
    'Brasil inteiro',
    'Macrorregiões',
    'Municípios específicos',
    'Cidade-sede para o raio',
    'Somente na minha região',
    'Priorizar minha região',
    'Aceito contratos executados à distância/remotos',
    'editais abertos na sua região',
  ])
    assert.match(source, new RegExp(copy));
  assert.match(source, /role="combobox"/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /aria-pressed|aria-selected/);
});
