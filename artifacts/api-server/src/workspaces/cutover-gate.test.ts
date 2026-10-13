import assert from "node:assert/strict";
import { test } from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const { CutoverModeChangedError, withCutoverGate } = await import("./cutover-gate");
const { MaintenanceInProgressError } = await import("../lib/api-error");

type GateDatabase = NonNullable<Parameters<typeof withCutoverGate>[2]>;

const dialect = new PgDialect();

/** Records every statement of the gated transaction; answers the lock and the flag read like PostgreSQL would. */
const fakeDatabase = (options: {
  acquired?: boolean;
  isolation?: string;
  state?: { mode: string; writes_paused: boolean } | null;
  stateError?: Error;
}) => {
  const statements: string[] = [];
  const tx = {
    execute: async (query: SQL) => {
      const text = dialect.sqlToQuery(query).sql.replace(/\s+/g, " ").trim();
      statements.push(text);
      if (text.includes("advisory_xact_lock_shared")) {
        return { rows: [{ acquired: options.acquired ?? true, isolation: options.isolation ?? "read committed" }] };
      }
      if (text.includes("workspace_cutover_events")) {
        if (options.stateError) throw options.stateError;
        return { rows: options.state ? [options.state] : [] };
      }
      return { rows: [] };
    },
  };
  const database = {
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as GateDatabase;
  return { database, statements, tx };
};

const mutate = (statements: string[]) => async () => {
  statements.push("mutation");
  return "saved";
};

test("HTTP: shared try-lock, then the flag read, then the mutation, as separate statements", async () => {
  const { database, statements } = fakeDatabase({});
  assert.equal(await withCutoverGate({ kind: "http" }, mutate(statements), database), "saved");
  assert.equal(statements.length, 3);
  assert.match(statements[0]!, /^select pg_try_advisory_xact_lock_shared\(hashtextextended\(\$1, 0\)\) as acquired/);
  assert.match(statements[0]!, /current_setting\('transaction_isolation'\)/);
  assert.doesNotMatch(statements[0]!, /workspace_cutover_events/);
  assert.equal(statements[1], "select mode, writes_paused from workspace_cutover_events order by id desc limit 1");
  assert.equal(statements[2], "mutation");
});

test("HTTP: the mutation receives the state it was gated on", async () => {
  const { database } = fakeDatabase({ state: { mode: "workspaces", writes_paused: false } });
  const state = await withCutoverGate({ kind: "http" }, async (_tx, current) => current, database);
  assert.deepEqual(state, { mode: "workspaces", writesPaused: false });
});

test("HTTP: a state change holding the lock answers 503 without reading the flag or writing", async () => {
  const { database, statements } = fakeDatabase({ acquired: false });
  await assert.rejects(
    withCutoverGate({ kind: "http" }, mutate(statements), database),
    (error) => error instanceof MaintenanceInProgressError && error.status === 503 && error.retryAfterSeconds === 60,
  );
  assert.equal(statements.length, 1);
});

test("HTTP: paused writes answer 503 and never reach the mutation", async () => {
  for (const mode of ["legacy", "workspaces"]) {
    const { database, statements } = fakeDatabase({ state: { mode, writes_paused: true } });
    await assert.rejects(withCutoverGate({ kind: "http" }, mutate(statements), database), MaintenanceInProgressError);
    assert.equal(statements.includes("mutation"), false);
  }
});

test("a flag read error propagates as itself and nothing is written", async () => {
  const failure = Object.assign(new Error("permission denied for table workspace_cutover_events"), { code: "42501" });
  for (const caller of [{ kind: "http" }, { kind: "job", cycleMode: "legacy" }] as const) {
    const { database, statements } = fakeDatabase({ stateError: failure });
    await assert.rejects(withCutoverGate(caller, mutate(statements), database), (error) => error === failure);
    assert.equal(statements.includes("mutation"), false);
  }
});

test("an unknown mode in the flag table fails instead of picking one", async () => {
  const { database, statements } = fakeDatabase({ state: { mode: "both", writes_paused: false } });
  await assert.rejects(withCutoverGate({ kind: "http" }, mutate(statements), database), /unknown mode "both"/);
  assert.equal(statements.includes("mutation"), false);
});

test("REPEATABLE READ and SERIALIZABLE are refused before the flag read", async () => {
  for (const isolation of ["repeatable read", "serializable"]) {
    const { database, statements } = fakeDatabase({ isolation });
    await assert.rejects(withCutoverGate({ kind: "http" }, mutate(statements), database), /requires READ COMMITTED/);
    assert.equal(statements.length, 1);
  }
});

test("job: lock_timeout 5s, blocking shared lock, flag read, mutation", async () => {
  const { database, statements } = fakeDatabase({});
  await withCutoverGate({ kind: "job", cycleMode: "legacy" }, mutate(statements), database);
  assert.deepEqual(statements.slice(0, 1), ["set local lock_timeout = '5s'"]);
  assert.match(statements[1]!, /from pg_advisory_xact_lock_shared\(hashtextextended\(\$1, 0\)\)/);
  assert.doesNotMatch(statements[1]!, /pg_try_/);
  assert.equal(statements[2], "select mode, writes_paused from workspace_cutover_events order by id desc limit 1");
  assert.equal(statements[3], "mutation");
});

test("job: a cycle started before the pause still writes in the same mode", async () => {
  const { database, statements } = fakeDatabase({ state: { mode: "legacy", writes_paused: true } });
  assert.equal(await withCutoverGate({ kind: "job", cycleMode: "legacy" }, mutate(statements), database), "saved");
});

test("job: a mode change during the cycle discards the write", async () => {
  const { database, statements } = fakeDatabase({ state: { mode: "workspaces", writes_paused: true } });
  await assert.rejects(
    withCutoverGate({ kind: "job", cycleMode: "legacy" }, mutate(statements), database),
    (error) =>
      error instanceof CutoverModeChangedError && error.cycleMode === "legacy" && error.currentMode === "workspaces",
  );
  assert.equal(statements.includes("mutation"), false);
});
