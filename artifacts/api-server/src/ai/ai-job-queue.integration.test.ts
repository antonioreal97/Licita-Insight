import assert from "node:assert/strict";
import { test } from "node:test";

test("durable queue deduplicates, prioritizes and recovers visibility", {
  skip: !process.env.PNCP_TEST_DATABASE_URL,
}, async () => {
  const schema = `ai_queue_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.APP_ROLE = "api";
  const { pool } = await import("@workspace/db");
  await pool.query(`create schema "${schema}"`);
  await pool.query(`
    create table ai_jobs (
      id text primary key, kind text not null, dedupe_key text not null unique,
      tender_id text not null, user_id text, payload jsonb not null default '{}'::jsonb,
      lane text not null, status text not null default 'queued', attempts integer not null default 0,
      max_attempts integer not null default 6, run_after timestamptz not null default now(),
      locked_by text, locked_until timestamptz, last_error text,
      created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
      workspace_id text
    )
  `);
  try {
    const { claimAiJobs, enqueueAiJob, recoverExpiredAiJobs } = await import("./ai-job-queue");
    const concurrent = await Promise.all(Array.from({ length: 100 }, () => enqueueAiJob({
      kind: "index", dedupeKey: "index:T1:v1", tenderId: "T1", userId: "U1",
      payload: { version: 1, previousVersion: 0 }, lane: "interactive",
    })));
    assert.equal(concurrent.filter(({ reason }) => reason === "created").length, 1);
    assert.equal((await pool.query("select count(*)::int as count from ai_jobs")).rows[0]?.count, 1);

    await enqueueAiJob({ kind: "fit", dedupeKey: "fit:T2", tenderId: "T2", payload: {}, lane: "batch" });
    await enqueueAiJob({ kind: "fit", dedupeKey: "fit:T3", tenderId: "T3", payload: {}, lane: "interactive" });
    const first = await claimAiJobs(["fit"], 1, "worker-priority", 50);
    assert.equal(first[0]?.dedupeKey, "fit:T3");

    const [left, right] = await Promise.all([
      claimAiJobs(["index"], 1, "worker-a", 50),
      claimAiJobs(["index"], 1, "worker-b", 50),
    ]);
    assert.equal(new Set([...left, ...right].map(({ id }) => id)).size, 1);
    await pool.query("update ai_jobs set locked_until = now() - interval '1 second' where status = 'running'");
    const recovered = await recoverExpiredAiJobs();
    assert.ok(recovered.requeued >= 2);
    await pool.query("update ai_jobs set run_after = now() - interval '1 second' where status = 'queued'");
    const reclaimed = await claimAiJobs(["index"], 1, "worker-c", 50);
    assert.equal(reclaimed.length, 1);
    assert.equal(reclaimed[0]?.attempts, 2);
  } finally {
    await pool.query(`drop schema "${schema}" cascade`);
    await pool.end();
  }
});
