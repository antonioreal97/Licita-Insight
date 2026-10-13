import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const { CUTOVER_DRAIN_QUERY, SCOPED_JOB_KEYS, cutoverDrainStatus } = await import("./cutover-drain");

/** A client that answers the drain query with `rows` and keeps what it was asked. */
const client = (rows: Array<{ routine: string; running: number; stale: number }>) => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  return {
    calls,
    query: async (text: string, values: unknown[]) => {
      calls.push({ text, values });
      return { rows };
    },
  };
};

test("nothing running is a finished drain; one cycle or one fit job holds it", async () => {
  assert.deepEqual(await cutoverDrainStatus(client([]) as never), { drained: true, running: [], stale: [] });
  const busy = client([
    { routine: "ai_jobs:fit", running: 2, stale: 0 },
    { routine: "job:email_digest", running: 1, stale: 0 },
  ]);
  assert.deepEqual(await cutoverDrainStatus(busy as never), {
    drained: false,
    running: [
      { routine: "ai_jobs:fit", running: 2 },
      { routine: "job:email_digest", running: 1 },
    ],
    stale: [],
  });
});

test("an audit row left running by a process that is gone is reported and does not hold the drain", async () => {
  const stale = client([{ routine: "job:pncp_collect", running: 0, stale: 1 }]);
  assert.deepEqual(await cutoverDrainStatus(stale as never), {
    drained: true,
    running: [],
    stale: [{ routine: "job:pncp_collect", stale: 1 }],
  });
});

test("the query takes the scoped job keys and the per-tender prefix as its two parameters", async () => {
  const asked = client([]);
  await cutoverDrainStatus(asked as never);
  assert.equal(asked.calls[0]!.text, CUTOVER_DRAIN_QUERY);
  assert.deepEqual(asked.calls[0]!.values, [[...SCOPED_JOB_KEYS], ["pncp_detail:%"]]);
  assert.deepEqual([...SCOPED_JOB_KEYS].sort(), [
    "daily_recommendations",
    "email_digest",
    "email_immediate",
    "personal_data_retention",
    "pncp_collect",
    "profile_alert_evaluation",
    "saved_search_evaluation",
    "trial_notifications",
  ]);
  assert.match(CUTOVER_DRAIN_QUERY, /kind = 'fit' and status = 'running'/);
  assert.doesNotMatch(CUTOVER_DRAIN_QUERY, /insert|update|delete/i, "read-only");
});
