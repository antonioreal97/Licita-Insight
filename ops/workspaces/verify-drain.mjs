import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, '../../artifacts/api-server/src/workspaces/cutover-drain.ts'), 'utf8');
const actual = readFileSync(path.join(here, 'drain.sql'), 'utf8');
const match = source.match(/export const CUTOVER_DRAIN_QUERY = `([\s\S]*?)`;/);
if (!match) throw new Error('CUTOVER_DRAIN_QUERY was not found');
const keys = [...source.matchAll(/^  "([^"]+)",$/gm)].map((item) => item[1]);
const prefixes = [...source.matchAll(/SCOPED_JOB_KEY_PREFIXES = \["([^"]+)"\]/g)].map((item) => item[1]);
const query = match[1]
  .replace('$1::text[]', `ARRAY[${keys.map((key) => `'${key}'`).join(',')}]::text[]`)
  .replace('$2::text[]', `ARRAY[${prefixes.map((prefix) => `'${prefix}%'`).join(',')}]::text[]`)
  .replace(/order by 1\s*$/, '');
const expected = `\\set ON_ERROR_STOP on\n-- Same CUTOVER_DRAIN_QUERY as artifacts/api-server/src/workspaces/cutover-drain.ts.\n-- Keep the two key arrays aligned with SCOPED_JOB_KEYS and SCOPED_JOB_KEY_PREFIXES.\nselect coalesce(sum(running), 0)::integer from (\n${query}) drain;\n`;
if (actual !== expected) throw new Error('drain.sql has drifted from CUTOVER_DRAIN_QUERY');
process.stdout.write('drain SQL parity: PASS\n');
