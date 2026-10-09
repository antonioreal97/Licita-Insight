import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { UFS } from '@/lib/ufs';
import { BRAZIL_MAP_HEIGHT, BRAZIL_MAP_WIDTH, BRAZIL_UF_PATHS } from './brazil-uf-paths';

test('the embedded IBGE mesh has one closed outline per state and stays under 60 kB', () => {
  assert.deepEqual(Object.keys(BRAZIL_UF_PATHS).sort(), [...UFS].sort());
  for (const uf of UFS) assert.match(BRAZIL_UF_PATHS[uf], /^M\d+ \d+l[-\d ]+z/, uf);
  assert.ok(BRAZIL_MAP_WIDTH > 0 && BRAZIL_MAP_HEIGHT > 0);
  assert.ok(readFileSync(new URL('./brazil-uf-paths.ts', import.meta.url)).byteLength < 60_000);
});
