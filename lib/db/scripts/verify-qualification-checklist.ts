import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const sourceUrl =
  process.env.QUALIFICATION_CHECKLIST_TEST_DATABASE_URL ??
  process.env.DATABASE_URL;
if (!sourceUrl) {
  throw new Error(
    "QUALIFICATION_CHECKLIST_TEST_DATABASE_URL or DATABASE_URL is required",
  );
}

const databaseName = `licita_qualification_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("options");
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
testUrl.searchParams.delete("options");
const admin = new pg.Client({ connectionString: adminUrl.toString() });

const push = () => {
  const result = spawnSync("pnpm", ["run", "push-force"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`push-force failed\n${result.stdout}\n${result.stderr}`);
  }
};

await admin.connect();
try {
  await admin.query(`create database "${databaseName}"`);
  push();
  const client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  try {
    const column = await client.query<{ column_default: string; is_nullable: string }>(`
      select column_default, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tender_ai_sheets'
        and column_name = 'qualification_checklist'
    `);
    if (
      column.rows[0]?.is_nullable !== "NO" ||
      !column.rows[0]?.column_default?.includes("[]")
    ) {
      throw new Error(
        `qualification_checklist schema mismatch: ${JSON.stringify(column.rows[0])}`,
      );
    }
    await client.query(`
      insert into tenders (
        id, pncp_control_number, title, organization_id, organization_name,
        modality, modality_label, status, estimated_value_status, source_id,
        source_name, search_text, title_norm, object_norm, items_norm,
        organization_norm, other_norm, raw_payload, fetched_at
      ) values (
        'TEST-TENDER', 'TEST-CONTROL', 'TEST DATA edital', 'TEST-ORG', 'TEST ORG',
        'other', 'Outra', 'open', 'not_published', 'test', 'TEST DATA',
        'habilitacao', 'edital', '', '', 'test org', '', '{}'::jsonb, now()
      );
      insert into tender_ai_sheets (
        id, tender_id, index_version, requested_model, prompt_version, status,
        qualification_checklist
      ) values (
        'TEST-SHEET', 'TEST-TENDER', 1, 'jev-1.13.0', 3, 'ready',
        '[{"type":"ato_societario","evidence":{"documentTitle":"Edital.pdf","documentUrl":"https://pncp.gov.br/test.pdf","page":4,"text":"ato constitutivo"},"confidence":0.93}]'::jsonb
      );
    `);
    push();
    const stored = await client.query<{ qualification_checklist: unknown[] }>(`
      select qualification_checklist
      from tender_ai_sheets
      where id = 'TEST-SHEET'
    `);
    if (
      stored.rows[0]?.qualification_checklist?.[0] === undefined ||
      stored.rows[0].qualification_checklist.length !== 1
    ) {
      throw new Error("qualification checklist did not survive the second push");
    }
    process.stdout.write(
      "empty database + two push-force runs + existing checklist: PASS\n",
    );
  } finally {
    await client.end();
  }
} finally {
  await admin.query(
    "select pg_terminate_backend(pid) from pg_stat_activity where datname=$1",
    [databaseName],
  );
  await admin.query(`drop database if exists "${databaseName}"`);
  await admin.end();
}
