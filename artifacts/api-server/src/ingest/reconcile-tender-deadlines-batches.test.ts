import assert from "node:assert/strict";
import { test } from "node:test";

test("reconciles a large backlog in batches and skips rows another transaction holds", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const schema = `deadline_batch_${crypto.randomUUID().replaceAll("-", "")}`;
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
     select 'expired-' || n, 'expired-' || n, 'expired', 'org', 'Org', 'pregao', 'Pregão', 'open',
       'not_informed', 'pncp', 'pncp', 'x', 'x', '', '', '', '', '{}', $1::timestamptz, $1::timestamptz - n * interval '1 minute'
     from generate_series(1, 7) as n`,
    [new Date("2026-10-03T12:00:00Z")],
  );
  const now = new Date("2026-10-04T12:00:00Z");
  let statements = 0;
  const counting = {
    query: (text: string, values: unknown[]) => {
      statements += 1;
      return pool.query(text, values);
    },
  } as unknown as Pick<typeof pool, "query">;

  // A collection holding one row: the batch skips it instead of waiting, and it stays for the next run.
  const holder = await pool.connect();
  try {
    await holder.query("begin");
    await holder.query("select 1 from tenders where id = 'expired-7' for update");
    assert.equal(await reconcileExpiredTenderStatuses(now, counting, { batchSize: 3 }), 6);
    assert.equal(statements, 3, "3 + 3 + 0: stops on the first short batch");
    await holder.query("rollback");
  } finally {
    holder.release();
  }
  assert.equal(await reconcileExpiredTenderStatuses(now, counting, { batchSize: 3 }), 1);
  const open = await pool.query("select count(*)::int as n from tenders where status = 'open'");
  assert.equal(open.rows[0]?.n, 0);

  // The time budget ends a run between batches; the rest waits for the next hour.
  await pool.query("update tenders set status = 'open'");
  let tick = 0;
  assert.equal(await reconcileExpiredTenderStatuses(now, counting, { batchSize: 2, maxMs: 1, clock: () => tick++ }), 2);
});
