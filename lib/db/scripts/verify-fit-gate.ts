import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const sourceUrl = process.env.FIT_GATE_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("FIT_GATE_TEST_DATABASE_URL or DATABASE_URL is required");
const databaseName = `licita_fit_gate_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
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
      insert into users (id, email) values ('U1', 'fit-gate@example.test');
      insert into tenders (
        id, pncp_control_number, title, organization_id, organization_name,
        modality, modality_label, status, estimated_value_status, source_id,
        source_name, search_text, title_norm, object_norm, items_norm,
        organization_norm, other_norm, raw_payload, fetched_at
      ) values ('T1', 'C1', 'Execução de obra', 'O1', 'Órgão', 'other', 'Outra',
        'open', 'not_published', 'S1', 'TEST', 'execucao obra', 'execucao obra', '',
        '', 'orgao', '', '{}'::jsonb, now());
      insert into company_tender_fits (
        id, user_id, tender_id, profile_version, tender_fingerprint,
        requested_model, prompt_version, status, lexical_gate_pass
      ) values ('F1', 'U1', 'T1', 1, 'fp', 'jev-test', 1, 'processing', true);
    `);
    push();
    const column = await client.query(`
      select is_nullable, data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'company_tender_fits'
        and column_name = 'lexical_gate_pass'
    `);
    const stored = await client.query(`select lexical_gate_pass from company_tender_fits where id = 'F1'`);
    if (column.rows[0]?.data_type !== "boolean" || stored.rows[0]?.lexical_gate_pass !== true) {
      throw new Error(`lexical gate column did not survive second push: ${JSON.stringify({ column: column.rows, stored: stored.rows })}`);
    }
    process.stdout.write("empty push + existing row + second push + lexical_gate_pass: PASS\n");
  } finally {
    await client.end();
  }
} finally {
  await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1", [databaseName]);
  await admin.query(`drop database if exists "${databaseName}"`);
  await admin.end();
}
