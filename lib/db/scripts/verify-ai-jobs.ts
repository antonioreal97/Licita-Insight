import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const sourceUrl = process.env.AI_JOBS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("AI_JOBS_TEST_DATABASE_URL or DATABASE_URL is required");
const databaseName = `licita_ai_jobs_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("options");
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
testUrl.searchParams.delete("options");
const admin = new pg.Client({ connectionString: adminUrl.toString() });
const push = () => {
  const result = spawnSync("pnpm", ["run", "push-force"], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: testUrl.toString() }, encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`push-force failed\n${result.stdout}\n${result.stderr}`);
};

await admin.connect();
try {
  await admin.query(`create database "${databaseName}"`);
  push();
  const client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  try {
    await client.query(`
      insert into users (id, email) values ('U1', 'queue@example.test');
      insert into tenders (
        id, pncp_control_number, title, organization_id, organization_name,
        modality, modality_label, status, estimated_value_status, source_id,
        source_name, search_text, title_norm, object_norm, items_norm,
        organization_norm, other_norm, raw_payload, fetched_at
      ) values ('T1', 'C1', 'Edital da fila', 'O1', 'Órgão', 'other', 'Outra',
        'open', 'not_published', 'S1', 'TEST', 'fila duravel', 'fila', 'duravel',
        '', 'orgao', '', '{}'::jsonb, now());
      insert into ai_jobs (id, kind, dedupe_key, tender_id, user_id, lane, payload)
      values ('J1', 'index', 'index:T1:v1', 'T1', 'U1', 'interactive', '{"version":1}');
    `);
    push();
    const row = await client.query(`select kind, payload->>'version' as version from ai_jobs where id = 'J1'`);
    const index = await client.query(`select indexdef from pg_indexes where indexname = 'ai_jobs_claim_idx'`);
    if (row.rows[0]?.kind !== "index" || row.rows[0]?.version !== "1" || index.rowCount !== 1) {
      throw new Error(`ai_jobs did not survive second push: ${JSON.stringify({ row: row.rows, index: index.rows })}`);
    }
    process.stdout.write("empty push + existing job + second push + claim index: PASS\n");
  } finally {
    await client.end();
  }
} finally {
  await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1", [databaseName]);
  await admin.query(`drop database if exists "${databaseName}"`);
  await admin.end();
}
