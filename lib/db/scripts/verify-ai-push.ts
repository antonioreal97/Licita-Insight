import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const sourceUrl = process.env.AI_PUSH_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("AI_PUSH_TEST_DATABASE_URL or DATABASE_URL is required");

const databaseName = `licita_ai_push_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("options");
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
testUrl.searchParams.delete("options");
const admin = new Client({ connectionString: adminUrl.toString() });

const push = () => {
  const result = spawnSync("pnpm", ["exec", "drizzle-kit", "push", "--force", "--config", "./drizzle.config.ts"], {
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
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  push();
  push();
  const testDb = new Client({ connectionString: testUrl.toString() });
  await testDb.connect();
  try {
    const column = await testDb.query<{
      is_generated: string;
      generation_expression: string;
    }>(`
      select is_generated, generation_expression
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tender_ai_passages'
        and column_name = 'search_vector'
    `);
    if (column.rows[0]?.is_generated !== "ALWAYS") {
      throw new Error(`search_vector is not generated: ${JSON.stringify(column.rows[0])}`);
    }
    await testDb.query(`
      insert into tenders (
        id, pncp_control_number, title, organization_id, organization_name,
        modality, modality_label, status, estimated_value_status, source_id,
        source_name, search_text, title_norm, object_norm, items_norm,
        organization_norm, other_norm, raw_payload, fetched_at
      ) values (
        'TEST-TENDER', 'TEST-CONTROL', 'TEST DATA edital', 'TEST-ORG', 'TEST ORG',
        'other', 'Outra', 'open', 'not_published', 'test', 'TEST DATA',
        'participacao consorcio', 'edital', '', '', 'test org', '', '{}'::jsonb, now()
      );
      insert into tender_ai_indexes (tender_id, source_fingerprint, status)
        values ('TEST-TENDER', 'TEST-FINGERPRINT', 'ready');
      insert into tender_ai_documents (
        id, tender_id, source_document_id, title, source_url, pages, status
      ) values (
        'TEST-DOCUMENT', 'TEST-TENDER', 'TEST-SOURCE-DOCUMENT', 'TEST DATA edital.pdf',
        'https://pncp.gov.br/test.pdf', 1, 'ready'
      );
      insert into tender_ai_passages (
        id, tender_id, document_id, index_version, page, passage_order, text
      ) values (
        'TEST-PASSAGE', 'TEST-TENDER', 'TEST-DOCUMENT', 1, 1, 0,
        'A participação de empresas em consórcio é permitida.'
      );
    `);
    const shortlist = await testDb.query(`
      select id from tender_ai_passages
      where search_vector @@ websearch_to_tsquery('portuguese', 'participação OR consórcio')
    `);
    if (shortlist.rowCount !== 1) throw new Error("Portuguese shortlist did not find the generated vector");
    process.stdout.write("push-force generated tsvector and shortlist: PASS\n");
  } finally {
    await testDb.end();
  }
} finally {
  await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1", [databaseName]);
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
}
