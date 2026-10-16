import assert from "node:assert/strict";
import { test } from "node:test";

test("reconciles only expired open PNCP tenders and is idempotent", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const schema = `deadline_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { pool } = await import("@workspace/db");
  const { reconcileExpiredTenderStatuses } = await import("./reconcile-tender-deadlines");
  await pool.query(`create schema "${schema}"`);
  t.after(async () => {
    await pool.query(`drop schema "${schema}" cascade`);
    await pool.end();
  });
  await pool.query(`create table "${schema}".tenders (like public.tenders including all)`);
  await pool.query(
    `insert into tenders (id, pncp_control_number, title, organization_id, organization_name,
      modality, modality_label, status, estimated_value_status, source_id, source_name,
      search_text, title_norm, object_norm, items_norm, organization_norm, other_norm,
      raw_payload, fetched_at, proposal_deadline)
     select id, id, id, 'org', 'Org', 'pregao', 'Pregão', status,
       'not_informed', source_id, source_id, id, id, '', '', '', '', '{}', $1, deadline
     from (values
       ('expired', 'open', 'pncp', $2::timestamptz),
       ('future', 'open', 'pncp', $3::timestamptz),
       ('unknown', 'open', 'pncp', null),
       ('direct-row', 'direct', 'pncp', null),
       ('cancelled', 'cancelled', 'pncp', $2::timestamptz),
       ('other-source', 'open', 'other', $2::timestamptz)
     ) as sample(id, status, source_id, deadline)`,
    [new Date("2026-10-03T12:00:00Z"), "2026-10-02T12:00:00Z", "2026-10-04T12:00:00Z"],
  );
  const now = new Date("2026-10-03T12:00:00Z");
  assert.equal(await reconcileExpiredTenderStatuses(now), 1);
  assert.equal(await reconcileExpiredTenderStatuses(now), 0);
  const result = await pool.query("select id, status from tenders order by id");
  assert.deepEqual(Object.fromEntries(result.rows.map(({ id, status }) => [id, status])), {
    cancelled: "cancelled",
    "direct-row": "direct",
    expired: "under_review",
    future: "open",
    "other-source": "open",
    unknown: "open",
  });
  assert.equal(await reconcileExpiredTenderStatuses(new Date("2026-10-05T12:00:00Z")), 1);
  assert.equal(
    (await pool.query("select status from tenders where id = 'future'")).rows[0]?.status,
    "under_review",
  );
});
