import assert from "node:assert/strict";
import { test } from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.LOG_LEVEL = "silent";
const { CutoverPausedError, cycleCaller, discardedByCutover, isCutoverInterruption, startCutoverCycle } = await import(
  "./cutover-cycle"
);
const { CutoverModeChangedError, enterCutoverGate } = await import("./cutover-gate");
const { MaintenanceInProgressError } = await import("../lib/api-error");

type GateTransaction = Parameters<typeof enterCutoverGate>[0];

const dialect = new PgDialect();
/** The flag table as one row, or none; `query` is what a pool or a client offers. */
const flag = (row?: { mode: string; writes_paused: boolean }) => ({
  query: async () => ({ rows: row ? [row] : [] }),
});
/** A transaction already open, recording the statements the gate runs in it. */
const openTransaction = (row: { mode: string; writes_paused: boolean }) => {
  const statements: string[] = [];
  const tx = {
    execute: async (query: SQL) => {
      const text = dialect.sqlToQuery(query).sql;
      statements.push(text.replace(/\s+/g, " ").trim());
      if (text.includes("advisory_xact_lock_shared")) return { rows: [{ acquired: true, isolation: "read committed" }] };
      return { rows: text.includes("workspace_cutover_events") ? [row] : [] };
    },
  } as unknown as GateTransaction;
  return { tx, statements };
};

test("a cycle reads the state before it starts and does not start while writes are paused", async () => {
  assert.deepEqual(await startCutoverCycle("test", flag() as never), { mode: "legacy" }, "no row is legacy with writes allowed");
  assert.deepEqual(await startCutoverCycle("test", flag({ mode: "workspaces", writes_paused: false }) as never), { mode: "workspaces" });
  assert.equal(await startCutoverCycle("test", flag({ mode: "legacy", writes_paused: true }) as never), null);
  assert.equal(await startCutoverCycle("test", flag({ mode: "workspaces", writes_paused: true }) as never), null);
  await assert.rejects(
    startCutoverCycle("test", { query: async () => Promise.reject(new Error("permission denied")) } as never),
    /permission denied/,
    "a read error never picks a mode",
  );
});

test("a started cycle writes during the pause, in the mode it read; a changed mode refuses the write", async () => {
  const cycle = { mode: "legacy" as const };
  assert.deepEqual(cycleCaller(cycle), { kind: "job", cycleMode: "legacy" });

  const paused = openTransaction({ mode: "legacy", writes_paused: true });
  assert.deepEqual(await enterCutoverGate(paused.tx, cycleCaller(cycle)), { mode: "legacy", writesPaused: true });
  assert.equal(paused.statements.length, 3);
  assert.match(paused.statements[0]!, /set local lock_timeout = '5s'/);
  assert.match(paused.statements[1]!, /pg_advisory_xact_lock_shared/);
  assert.match(paused.statements[2]!, /from workspace_cutover_events/, "the flag is read in its own statement, after the lock");

  const switched = openTransaction({ mode: "workspaces", writes_paused: false });
  await assert.rejects(enterCutoverGate(switched.tx, cycleCaller(cycle)), CutoverModeChangedError);
  await assert.rejects(enterCutoverGate(paused.tx, { kind: "http" }), MaintenanceInProgressError, "a request still refuses");
});

test("only the cutover interruptions are dropped; any other failure is still a failure", () => {
  const lockTimeout = Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
  const wrapped = Object.assign(new Error("Failed query"), { cause: lockTimeout });
  for (const error of [new CutoverModeChangedError("legacy", "workspaces"), new CutoverPausedError("fit_job"), lockTimeout, wrapped]) {
    assert.equal(isCutoverInterruption(error), true, String(error));
    assert.equal(discardedByCutover(error, "test"), true);
  }
  const uniqueViolation = Object.assign(new Error("duplicate key"), { code: "23505" });
  for (const error of [new Error("boom"), uniqueViolation, new MaintenanceInProgressError(), null, undefined]) {
    assert.equal(isCutoverInterruption(error), false, String(error));
    assert.equal(discardedByCutover(error, "test"), false);
  }
});
