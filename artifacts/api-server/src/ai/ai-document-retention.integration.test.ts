import assert from "node:assert/strict";
import { test } from "node:test";

test("retention honors deadline and saved tenders, tombstones in batches and preserves sheets", {
  skip: !process.env.PNCP_TEST_DATABASE_URL,
}, async () => {
  const schema = `ai_retention_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { pool } = await import("@workspace/db");
  await pool.query(`create schema "${schema}"`);
  await pool.query(`
    create table tenders (id text primary key, proposal_deadline timestamptz);
    create table saved_tenders (user_id text, tender_id text);
    create table tender_ai_indexes (tender_id text primary key, purged_at timestamptz, updated_at timestamptz default now());
    create table tender_ai_documents (id text primary key, tender_id text);
    create table tender_ai_passages (id text primary key, tender_id text, text text);
    create table tender_ai_sheets (id text primary key, tender_id text, status text);
    insert into tenders values
      ('expired','2026-01-01'), ('saved','2026-01-01'), ('recent','2026-09-20');
    insert into saved_tenders values ('U1','saved');
    insert into tender_ai_indexes (tender_id) values ('expired'),('saved'),('recent');
    insert into tender_ai_documents values ('D1','expired'),('D2','saved'),('D3','recent');
    insert into tender_ai_passages values ('P1','expired','texto'),('P2','saved','texto'),('P3','recent','texto');
    insert into tender_ai_sheets values ('S1','expired','ready');
  `);
  try {
    const { purgeExpiredAiDocuments, reportAiDocumentRetention } = await import("./ai-document-retention");
    const now = new Date("2026-09-26T12:00:00Z");
    const dryRun = await reportAiDocumentRetention(now, 90);
    assert.deepEqual({ tenders: dryRun.tenders, passages: dryRun.passages, documents: dryRun.documents, saved: dryRun.savedTenders },
      { tenders: 1, passages: 1, documents: 1, saved: 1 });
    assert.equal((await pool.query("select count(*)::int count from tender_ai_passages")).rows[0]?.count, 3);
    const result = await purgeExpiredAiDocuments(now, 90, 1);
    assert.equal(result.tenders, 1);
    assert.equal((await pool.query("select purged_at is not null as purged from tender_ai_indexes where tender_id='expired'")).rows[0]?.purged, true);
    assert.equal((await pool.query("select count(*)::int count from tender_ai_documents where tender_id='expired'")).rows[0]?.count, 0);
    assert.equal((await pool.query("select count(*)::int count from tender_ai_documents where tender_id='saved'")).rows[0]?.count, 1);
    assert.equal((await pool.query("select count(*)::int count from tender_ai_sheets where tender_id='expired'")).rows[0]?.count, 1);
  } finally {
    await pool.query(`drop schema "${schema}" cascade`);
    await pool.end();
  }
});
