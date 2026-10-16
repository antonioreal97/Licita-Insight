import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Proves the SQL backfill reclassifies open → direct without touching the notifications
 * table (plain UPDATE, not upsertPublications).
 */
test(
  "direct status backfill is idempotent and creates no notifications",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async (t) => {
    const schema = `direct_bf_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    const { pool } = await import("@workspace/db");
    await pool.query(`create schema "${schema}"`);
    t.after(async () => {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    });

    await pool.query(`create table "${schema}".tenders (like public.tenders including all)`);
    await pool.query(`create table "${schema}".notifications (
      id text primary key,
      user_id text not null,
      type text not null,
      created_at timestamptz not null default now()
    )`);

    const now = new Date("2026-10-16T12:00:00Z");
    await pool.query(
      `insert into tenders (id, pncp_control_number, title, organization_id, organization_name,
        modality, modality_label, status, estimated_value_status, source_id, source_name,
        search_text, title_norm, object_norm, items_norm, organization_norm, other_norm,
        raw_payload, fetched_at, proposal_deadline)
       select id, id, id, 'org', 'Org', modality, modality, status,
         'not_informed', 'pncp', 'pncp', id, id, '', '', '', '', '{}', $1, deadline
       from (values
         ('d1', 'dispensa', 'open', null::timestamptz),
         ('d2', 'inexigibilidade', 'open', null::timestamptz),
         ('keep-open', 'dispensa', 'open', $2::timestamptz),
         ('cred', 'credenciamento', 'open', null::timestamptz),
         ('pregao', 'pregao_eletronico', 'open', null::timestamptz)
       ) as sample(id, modality, status, deadline)`,
      [now, "2026-11-01T12:00:00Z"],
    );

    const sqlPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../lib/db/migrations/manual/0046_direct_contracting_status.sql",
    );
    const sql = readFileSync(sqlPath, "utf8");
    const first = await pool.query(sql);
    assert.equal(first.rowCount, 2);
    const second = await pool.query(sql);
    assert.equal(second.rowCount, 0, "second run is a no-op");

    const statuses = await pool.query("select id, status from tenders order by id");
    assert.deepEqual(Object.fromEntries(statuses.rows.map((r) => [r.id, r.status])), {
      cred: "open",
      d1: "direct",
      d2: "direct",
      "keep-open": "open",
      pregao: "open",
    });

    const notes = await pool.query("select count(*)::int as n from notifications");
    assert.equal(notes.rows[0]?.n, 0, "backfill must not insert notifications");
  },
);
