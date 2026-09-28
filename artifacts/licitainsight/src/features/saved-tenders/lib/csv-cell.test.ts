import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell } from './csv-cell';

test('CSV protege fórmulas e mantém aspas, acentos e separadores dentro da célula', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('  @SUM(1)'), '"\'  @SUM(1)"');
  assert.equal(csvCell('Próxima ação; "teste"'), '"Próxima ação; ""teste"""');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(2), '"2"');
});
