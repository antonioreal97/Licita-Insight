import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.LOG_LEVEL = "silent";
const { deleteRecommendationHistory, dismissRecommendation, recordRecommendationEvent } = await import(
  "../recommendations/recommendation-service"
);
const { MaintenanceInProgressError } = await import("../lib/api-error");

type GateDatabase = NonNullable<Parameters<typeof dismissRecommendation>[3]>;
type Mode = "legacy" | "workspaces";

const dialect = new PgDialect();
const WORKSPACE_ID = `ws_${"a".repeat(32)}`;
const TENDER_ID = "tender-1";
const now = new Date("2026-10-13T12:00:00.000Z");
const tender = {
  id: TENDER_ID,
  title: "Aquisição de computadores TEST DATA",
  objectSummary: null,
  categories: [{ slug: "ti-telecom", label: "TI e telecom" }],
};

/**
 * A gated transaction that records each query as `<operation> <table> [by <scope column>]`, answers selects from
 * `rows` (keyed by the table in `from`) and `returning()` with them too, and the gate statements like PostgreSQL would.
 * It never stops the pending rebuild of the service: the timers are unreferenced and the process ends first.
 */
const recordingDatabase = (mode: Mode, options: { writesPaused?: boolean; recommended?: boolean } = {}) => {
  const log: string[] = [];
  const inserted: Array<Record<string, unknown>> = [];
  const conflictSets: Array<Record<string, unknown>> = [];
  const rows: Record<string, unknown[]> = {
    tenders: [tender],
    user_recommendations: options.recommended === false ? [] : [{ tenderId: TENDER_ID }],
    workspace_members: [{ id: WORKSPACE_ID, showInternationalOpportunities: false }],
  };
  const scope = (where: SQL): string => {
    const text = dialect.sqlToQuery(where).sql;
    if (/"recommendation_\w+"\."workspace_id"|"user_recommendations"\."workspace_id"/.test(text)) return " by workspace_id";
    return /"recommendation_\w+"\."user_id"|"user_recommendations"\."user_id"/.test(text) ? " by user_id" : "";
  };
  const chain = (result: () => unknown[], onCall: (method: string, args: unknown[]) => void) => {
    const proxy: unknown = new Proxy(() => {}, {
      get: (_target, property) =>
        property === "then"
          ? (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
              Promise.resolve().then(result).then(resolve, reject)
          : (...args: unknown[]) => {
              onCall(String(property), args);
              return proxy;
            },
    });
    return proxy;
  };
  const tx = {
    execute: async (query: SQL) => {
      const text = dialect.sqlToQuery(query).sql;
      if (text.includes("advisory_xact_lock_shared")) return { rows: [{ acquired: true, isolation: "read committed" }] };
      if (text.includes("workspace_cutover_events")) {
        return { rows: [{ mode, writes_paused: options.writesPaused ?? false }] };
      }
      return { rows: [] };
    },
    select: () => {
      let table = "";
      return chain(
        () => rows[table] ?? [],
        (method, args) => {
          if (method === "from") table = getTableName(args[0] as Table);
          if (method === "where") log.push(`read ${table}${scope(args[0] as SQL)}`);
        },
      );
    },
    insert: (table: Table) =>
      chain(
        () => [],
        (method, args) => {
          if (method === "values") {
            inserted.push(args[0] as Record<string, unknown>);
            log.push(`insert ${getTableName(table)}`);
          }
          if (method === "onConflictDoUpdate") conflictSets.push((args[0] as { set: Record<string, unknown> }).set);
        },
      ),
    delete: (table: Table) =>
      chain(
        () => rows[getTableName(table)] ?? [],
        (method, args) => {
          if (method === "where") log.push(`delete ${getTableName(table)}${scope(args[0] as SQL)}`);
        },
      ),
  };
  const database = {
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as GateDatabase;
  return { database, log, inserted, conflictSets };
};

test("a dismissal is keyed by the user in legacy and stamped with the default workspace in workspaces", async () => {
  const legacy = recordingDatabase("legacy");
  // The daily counter that follows the dismissal is the account-wide table and has no database here.
  await assert.rejects(dismissRecommendation("user-1", TENDER_ID, now, legacy.database));
  assert.deepEqual(legacy.log, [
    "read tenders",
    "insert recommendation_dismissals",
    "delete user_recommendations by user_id",
  ]);
  assert.equal("workspaceId" in legacy.inserted[0]!, false, "legacy writes today's row");
  assert.deepEqual(Object.keys(legacy.conflictSets[0]!), ["dismissedAt"]);

  const workspaces = recordingDatabase("workspaces");
  await assert.rejects(dismissRecommendation("user-1", TENDER_ID, now, workspaces.database));
  assert.deepEqual(workspaces.log, [
    "read workspace_members",
    "read tenders",
    "insert recommendation_dismissals",
    "delete user_recommendations by workspace_id",
  ]);
  assert.equal(workspaces.inserted[0]!.workspaceId, WORKSPACE_ID);
  assert.equal(workspaces.inserted[0]!.userId, "user-1", "the legacy key is still written until W4");
  assert.deepEqual(workspaces.inserted[0]!.terms, ["computadores", "test", "data"]);
  assert.deepEqual(workspaces.conflictSets[0], { workspaceId: WORKSPACE_ID, dismissedAt: now }, "an upsert stamps the row it rewrites");
});

test("an interest event removes the recommendation of the scope and counts in the account-wide metrics", async () => {
  for (const mode of ["legacy", "workspaces"] as const) {
    const column = mode === "legacy" ? "user_id" : "workspace_id";
    const shown = recordingDatabase(mode);
    assert.equal(await recordRecommendationEvent("user-1", { type: "interest", tenderId: TENDER_ID }, now, shown.database), true);
    assert.deepEqual(shown.log.slice(-2), [`delete user_recommendations by ${column}`, "insert recommendation_metrics_daily"]);
    assert.equal("workspaceId" in shown.inserted[0]!, false, "the daily metrics stay global");

    const absent = recordingDatabase(mode, { recommended: false });
    assert.equal(await recordRecommendationEvent("user-1", { type: "interest", tenderId: TENDER_ID }, now, absent.database), false);
    assert.deepEqual(absent.inserted, []);
  }
});

test("erasing the history reaches every event of the account in both modes", async () => {
  for (const mode of ["legacy", "workspaces"] as const) {
    const { database, log } = recordingDatabase(mode);
    await deleteRecommendationHistory("user-1", database);
    assert.deepEqual(log, ["delete recommendation_events by user_id"]);
  }
});

test("paused writes answer 503 in both modes before any table is touched", async () => {
  for (const mode of ["legacy", "workspaces"] as const) {
    const { database, log } = recordingDatabase(mode, { writesPaused: true });
    await assert.rejects(dismissRecommendation("user-1", TENDER_ID, now, database), MaintenanceInProgressError);
    await assert.rejects(recordRecommendationEvent("user-1", { type: "interest", tenderId: TENDER_ID }, now, database), MaintenanceInProgressError);
    await assert.rejects(deleteRecommendationHistory("user-1", database), MaintenanceInProgressError);
    assert.deepEqual(log, []);
  }
});
