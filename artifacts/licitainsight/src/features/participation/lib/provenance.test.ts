import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AUTO_PASSAGES_NOTICE } from './provenance';

/** Every file that renders the tender detail: the page, its panels and the participation blocks. */
const features = fileURLToPath(new URL('../../', import.meta.url));
const detailSources = ['tenders', 'participation'].flatMap((dir) =>
  readdirSync(join(features, dir), { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.test.ts'))
    .map((file) => ({ path: relative(features, join(features, dir, file)), source: readFileSync(join(features, dir, file), 'utf8') })),
);
const filesWith = (pattern: RegExp) => detailSources.filter(({ source }) => pattern.test(source)).map(({ path }) => path);

test('aviso único: o texto dos trechos automáticos existe só na constante', () => {
  assert.match(AUTO_PASSAGES_NOTICE, /escolhidos automaticamente/);
  assert.match(AUTO_PASSAGES_NOTICE, /Confira o edital original antes de decidir/);
  assert.deepEqual(filesWith(/escolhidos automaticamente/), ['participation/lib/provenance.ts']);
});

test('aviso único: só "Antes de decidir" mostra o aviso, uma vez', () => {
  assert.deepEqual(filesWith(/\{AUTO_PASSAGES_NOTICE\}/), ['participation/components/decision-panel.tsx']);
  assert.deepEqual(filesWith(/text-sheet-disclaimer/), ['participation/components/decision-panel.tsx']);
  const panel = detailSources.find(({ path }) => path === 'participation/components/decision-panel.tsx')!.source;
  assert.equal(panel.match(/\{AUTO_PASSAGES_NOTICE\}/g)?.length, 1);
});
