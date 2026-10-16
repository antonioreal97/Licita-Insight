// Batched open → direct (or reverse) reclassification. Never points at production by accident:
// require DATABASE_URL and an explicit --i-understand-this-writes.
//
//   DATABASE_URL=postgres://… pnpm exec tsx scripts/backfill-direct-status.ts --i-understand-this-writes
//   DATABASE_URL=postgres://… pnpm exec tsx scripts/backfill-direct-status.ts --i-understand-this-writes --rollback
//
// Plain SQL UPDATE — does not call upsertPublications, so no tender_status_changed notifications.
import pg from "pg";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
if (!process.argv.includes("--i-understand-this-writes")) {
  throw new Error("Pass --i-understand-this-writes to run the backfill");
}

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const rollback = process.argv.includes("--rollback");
const batchSize = Math.max(1, Math.min(20_000, Number(arg("--batch") ?? "8000")));
const pauseMs = Math.max(0, Number(arg("--pause-ms") ?? "50"));
if (!Number.isFinite(batchSize)) throw new Error("--batch must be a number");
if (!Number.isFinite(pauseMs)) throw new Error("--pause-ms must be a number");

const forwardSql = `
  WITH picked AS (
    SELECT id
    FROM tenders
    WHERE status = 'open'
      AND modality IN ('dispensa', 'inexigibilidade')
      AND proposal_deadline IS NULL
    ORDER BY id
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE tenders t
  SET status = 'direct', updated_at = now()
  FROM picked
  WHERE t.id = picked.id
`;

const rollbackSql = `
  WITH picked AS (
    SELECT id
    FROM tenders
    WHERE status = 'direct'
      AND modality IN ('dispensa', 'inexigibilidade')
      AND proposal_deadline IS NULL
    ORDER BY id
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE tenders t
  SET status = 'open', updated_at = now()
  FROM picked
  WHERE t.id = picked.id
`;

const countSql = rollback
  ? `select count(*)::int as n from tenders
     where status = 'direct' and modality in ('dispensa','inexigibilidade') and proposal_deadline is null`
  : `select count(*)::int as n from tenders
     where status = 'open' and modality in ('dispensa','inexigibilidade') and proposal_deadline is null`;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const before = await client.query<{ n: number }>(countSql);
  const remaining = before.rows[0]?.n ?? 0;
  process.stdout.write(
    `${JSON.stringify({ phase: rollback ? "rollback" : "forward", remaining, batchSize }, null, 2)}\n`,
  );

  let total = 0;
  let batches = 0;
  for (;;) {
    await client.query("begin");
    const result = await client.query(rollback ? rollbackSql : forwardSql, [batchSize]);
    await client.query("commit");
    const updated = result.rowCount ?? 0;
    total += updated;
    batches += 1;
    process.stdout.write(`${JSON.stringify({ batch: batches, updated, total })}\n`);
    if (updated === 0) break;
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
  }

  const after = await client.query<{ n: number }>(countSql);
  const statusBreakdown = await client.query<{ status: string; n: number }>(
    `select status, count(*)::int as n from tenders group by 1 order by 1`,
  );
  process.stdout.write(
    `${JSON.stringify({
      done: true,
      total,
      batches,
      stillMatching: after.rows[0]?.n ?? 0,
      byStatus: Object.fromEntries(statusBreakdown.rows.map((r) => [r.status, r.n])),
    }, null, 2)}\n`,
  );
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* connection may already be closed */
  }
  throw error;
} finally {
  await client.end();
}
