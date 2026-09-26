import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const sourceUrl = process.env.SEARCH_INDEX_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("SEARCH_INDEX_TEST_DATABASE_URL or DATABASE_URL is required");
const databaseName = `licita_search_idx_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("options");
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
testUrl.searchParams.delete("options");
const admin = new Client({ connectionString: adminUrl.toString() });

const run = (script: string) => {
  const result = spawnSync("pnpm", ["run", script], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`${script} failed\n${result.stdout}\n${result.stderr}`);
};

await admin.connect();
try {
  await admin.query(`create database "${databaseName}"`);
  run("prepare-extensions");
  run("push-force");
  run("push-force");
  const testDb = new Client({ connectionString: testUrl.toString() });
  await testDb.connect();
  try {
    const indexes = await testDb.query<{ indexname: string }>(`
      select indexname from pg_indexes
      where schemaname = 'public'
        and indexname in ('tenders_search_text_trgm_idx', 'cultural_opportunities_search_text_trgm_idx')
      order by indexname
    `);
    if (indexes.rowCount !== 2) throw new Error(`Missing trigram indexes: ${JSON.stringify(indexes.rows)}`);
    await testDb.query(`
      insert into tenders (
        id, pncp_control_number, title, organization_id, organization_name,
        modality, modality_label, status, estimated_value_status, source_id,
        source_name, search_text, title_norm, object_norm, items_norm,
        organization_norm, other_norm, raw_payload, fetched_at
      ) select 'T-' || i, 'C-' || i, 'Teste ' || i, 'O', 'Órgão', 'other',
        'Outra', 'open', 'not_published', 'test', 'TEST',
        case when i = 777 then 'equipamento ultrassom veterinario' else 'material expediente comum' end,
        'teste', '', '', 'orgao', '', '{}'::jsonb, now()
      from generate_series(1, 5000) i;
      analyze tenders;
      set enable_seqscan = off;
    `);
    const plan = await testDb.query<{ "QUERY PLAN": string }>(`
      explain (analyze, buffers) select id from tenders where search_text like '%ultrassom%'
    `);
    const text = plan.rows.map((row) => row["QUERY PLAN"]).join("\n");
    if (!text.includes("Bitmap Index Scan on tenders_search_text_trgm_idx")) {
      throw new Error(`Expected trigram Bitmap Index Scan\n${text}`);
    }
    process.stdout.write(`empty push + existing push + Bitmap Index Scan: PASS\n${text}\n`);
  } finally {
    await testDb.end();
  }
} finally {
  await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1", [databaseName]);
  await admin.query(`drop database if exists "${databaseName}"`);
  await admin.end();
}
