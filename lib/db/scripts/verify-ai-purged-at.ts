import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const sourceUrl = process.env.AI_PURGED_AT_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("AI_PURGED_AT_TEST_DATABASE_URL or DATABASE_URL is required");
const databaseName = `licita_ai_purge_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const adminUrl = new URL(sourceUrl); adminUrl.pathname = "/postgres"; adminUrl.searchParams.delete("options");
const testUrl = new URL(sourceUrl); testUrl.pathname = `/${databaseName}`; testUrl.searchParams.delete("options");
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
  const client = new pg.Client({ connectionString: testUrl.toString() }); await client.connect();
  try {
    await client.query(`
      insert into tenders (id, pncp_control_number, title, organization_id, organization_name, modality,
        modality_label, status, estimated_value_status, source_id, source_name, search_text, title_norm,
        object_norm, items_norm, organization_norm, other_norm, raw_payload, fetched_at)
      values ('T1','C1','Retenção','O1','Órgão','other','Outra','closed','not_published','S1','TEST',
        'retencao','retencao','','','orgao','','{}',now());
      insert into tender_ai_indexes (tender_id, source_fingerprint, status, purged_at)
      values ('T1','fp','ready','2026-09-26T12:00:00Z');
    `);
    push();
    const row = await client.query(`select purged_at from tender_ai_indexes where tender_id='T1'`);
    if (!row.rows[0]?.purged_at) throw new Error("purged_at did not survive the second push");
    process.stdout.write("empty push + existing tombstone + second push + purged_at: PASS\n");
  } finally { await client.end(); }
} finally {
  await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1", [databaseName]);
  await admin.query(`drop database if exists "${databaseName}"`); await admin.end();
}
