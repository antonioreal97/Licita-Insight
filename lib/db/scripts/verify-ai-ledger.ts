import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const sourceUrl = process.env.AI_LEDGER_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("AI_LEDGER_TEST_DATABASE_URL or DATABASE_URL is required");
const databaseName = `licita_ai_ledger_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("options");
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
testUrl.searchParams.delete("options");
const admin = new Client({ connectionString: adminUrl.toString() });

const push = () => {
  const result = spawnSync("pnpm", ["run", "push-force"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`push-force failed\n${result.stdout}\n${result.stderr}`);
};

await admin.connect();
try {
  await admin.query(`create database "${databaseName}"`);
  push();
  const testDb = new Client({ connectionString: testUrl.toString() });
  await testDb.connect();
  try {
    await testDb.query(`
      insert into users (id, email) values ('U1', 'ledger@example.com');
      insert into tenders (
        id, pncp_control_number, title, organization_id, organization_name,
        modality, modality_label, status, estimated_value_status, source_id,
        source_name, search_text, title_norm, object_norm, items_norm,
        organization_norm, other_norm, raw_payload, fetched_at
      ) values ('T1', 'C1', 'Edital realista', 'O1', 'Órgão', 'other', 'Outra',
        'open', 'not_published', 'S1', 'TEST', 'obra civil', 'edital', 'obra',
        'cimento', 'orgao', '', '{}'::jsonb, now());
      insert into ai_ask_requests (
        id, user_id, tender_id, question, normalized_question, index_version,
        requested_model, response_model, status, input_tokens, estimated_cost_usd
      ) values ('A1', 'U1', 'T1', 'Qual o prazo?', 'qual o prazo', 1,
        'jev-test', 'jev-test', 'answered', 9000, 0.00037800);
    `);
    push();
    const relation = await testDb.query(`
      select relkind from pg_class where oid = 'ai_usage_ledger'::regclass
    `);
    if (relation.rows[0]?.relkind !== "v") throw new Error("ai_usage_ledger is not a view");
    const rows = await testDb.query(`select * from ai_usage_ledger where feature = 'ask'`);
    if (rows.rowCount !== 1 || rows.rows[0]?.user_id !== "U1") {
      throw new Error(`ledger row did not survive the second push: ${JSON.stringify(rows.rows)}`);
    }
    process.stdout.write("empty push + existing data + second push + ledger SELECT: PASS\n");
  } finally {
    await testDb.end();
  }
} finally {
  await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1", [databaseName]);
  await admin.query(`drop database if exists "${databaseName}"`);
  await admin.end();
}
