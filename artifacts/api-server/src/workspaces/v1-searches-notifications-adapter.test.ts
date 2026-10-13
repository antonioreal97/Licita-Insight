import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.LOG_LEVEL = "silent";
const {
  createSavedSearch,
  deleteSavedSearch,
  markNotificationsRead,
  markSavedSearchSeen,
  restoreSavedSearch,
  updateSavedSearch,
} = await import("../account/account-service");
const { MaintenanceInProgressError, NotFoundError } = await import("../lib/api-error");

type GateDatabase = NonNullable<Parameters<typeof createSavedSearch>[1]>;
type Mode = "legacy" | "workspaces";

const dialect = new PgDialect();
const WORKSPACE_ID = `ws_${"a".repeat(32)}`;
const at = new Date("2026-10-01T12:00:00.000Z");

const stored = (overrides: Record<string, unknown> = {}) => ({
  id: "search-1",
  userId: "user-1",
  workspaceId: null as string | null,
  name: "Computadores",
  query: "q=computadores",
  alertsEnabled: true,
  createdAt: at,
  updatedAt: at,
  deletedAt: null as Date | null,
  lastCheckedAt: at,
  newMatchesCount: 3,
  ...overrides,
});

/**
 * A gated transaction that records each query as `<operation> <table> [by <scope>]`, answers selects from `rows`
 * (keyed by the table in `from`; a query for a duplicate finds none) and `returning()` with the written values, and
 * the gate statements like PostgreSQL would.
 */
const recordingDatabase = (mode: Mode, options: { writesPaused?: boolean; searches?: unknown[] } = {}) => {
  const log: string[] = [];
  const inserted: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const rows: Record<string, unknown[]> = {
    saved_searches: options.searches ?? [],
    notifications: [{ value: 2 }],
    workspace_members: [{ id: WORKSPACE_ID, showInternationalOpportunities: false }],
  };
  const scope = (where: SQL): string => {
    const text = dialect.sqlToQuery(where).sql;
    const columns = ["user_id", "workspace_id"].filter((column) => /"(saved_searches|notifications)"\."/.test(text) && text.includes(`."${column}" = `));
    const tolerant = /"notifications"\."workspace_id" is null/.test(text) ? " or no workspace" : "";
    return columns.length > 0 ? ` by ${columns.join(" and ")}${tolerant}` : "";
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
      let duplicateCheck = false;
      return chain(
        () => (duplicateCheck ? [] : (rows[table] ?? [])),
        (method, args) => {
          if (method === "from") table = getTableName(args[0] as Table);
          if (method !== "where") return;
          const text = dialect.sqlToQuery(args[0] as SQL).sql;
          duplicateCheck = text.includes('"saved_searches"."query" = ');
          log.push(`read ${table}${scope(args[0] as SQL)}`);
        },
      );
    },
    insert: (table: Table) => {
      let values: Array<Record<string, unknown>> = [];
      return chain(
        () => values,
        (method, args) => {
          if (method !== "values") return;
          values = [args[0]].flat() as Array<Record<string, unknown>>;
          inserted.push(...values);
          log.push(`insert ${getTableName(table)}`);
        },
      );
    },
    update: (table: Table) => {
      let values: Record<string, unknown> = {};
      return chain(
        () => (rows[getTableName(table)] ?? []).map((row) => ({ ...(row as object), ...values })),
        (method, args) => {
          if (method === "set") updates.push((values = args[0] as Record<string, unknown>));
          if (method === "where") log.push(`update ${getTableName(table)}${scope(args[0] as SQL)}`);
        },
      );
    },
  };
  const database = {
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as GateDatabase;
  return { database, log, inserted, updates };
};

/** `createdAt`, `updatedAt` and `lastCheckedAt` come from the clock of each call, and the id is random. */
const withoutClock = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (key, entry) => (/At$/.test(key) || key === "id" ? "<varies>" : entry)));

test("a new saved search is keyed by the user in legacy and stamped with the default workspace in workspaces", async () => {
  const input = { userId: "user-1", name: "Computadores", query: "q=computadores", alertsEnabled: true };
  const legacy = recordingDatabase("legacy");
  const legacySaved = await createSavedSearch(input, legacy.database);
  assert.deepEqual(legacy.log, [
    "read saved_searches by user_id",
    "read saved_searches by user_id",
    "insert saved_searches",
  ]);
  assert.equal("workspaceId" in legacy.inserted[0]!, false, "legacy writes today's row");

  const workspaces = recordingDatabase("workspaces");
  const saved = await createSavedSearch(input, workspaces.database);
  assert.deepEqual(workspaces.log, [
    "read workspace_members",
    "read saved_searches by workspace_id",
    "read saved_searches by workspace_id",
    "insert saved_searches",
  ]);
  assert.equal(workspaces.inserted[0]!.workspaceId, WORKSPACE_ID);
  assert.equal(workspaces.inserted[0]!.userId, "user-1", "the legacy key is still written until W4");
  assert.ok(workspaces.inserted[0]!.lastCheckedAt instanceof Date, "alerts start their checkpoint in both modes");
  assert.deepEqual(withoutClock(saved), withoutClock(legacySaved));
});

test("updating, removing, restoring and marking a saved search as seen follow the mode and never move the row", async () => {
  const answers = [];
  for (const mode of ["legacy", "workspaces"] as const) {
    const row = stored({ workspaceId: mode === "workspaces" ? WORKSPACE_ID : null });
    const column = mode === "legacy" ? "user_id" : "workspace_id";

    const edit = recordingDatabase(mode, { searches: [row] });
    const edited = await updateSavedSearch({ userId: "user-1", id: "search-1", name: "Notebooks" }, edit.database);
    assert.deepEqual(edit.log.slice(-3), ["read saved_searches", `read saved_searches by ${column}`, `update saved_searches by ${column}`]);
    assert.equal(edited.newMatchesCount, 3, "renaming keeps the checkpoint and the counter");
    assert.equal("lastCheckedAt" in edit.updates[0]!, false);

    const seen = recordingDatabase(mode, { searches: [row] });
    const marked = await markSavedSearchSeen("user-1", "search-1", seen.database);
    assert.deepEqual(seen.log.slice(-2), ["read saved_searches", `update saved_searches by ${column}`]);
    assert.equal(marked.newMatchesCount, 0);

    const removal = recordingDatabase(mode, { searches: [row] });
    await deleteSavedSearch("user-1", "search-1", removal.database);
    assert.deepEqual(removal.log.slice(-2), ["read saved_searches", `update saved_searches by ${column}`]);
    assert.ok(removal.updates[0]!.deletedAt instanceof Date, "removal is a soft delete");

    const restoration = recordingDatabase(mode, { searches: [{ ...row, deletedAt: new Date() }] });
    const restored = await restoreSavedSearch("user-1", "search-1", restoration.database);
    assert.deepEqual(restoration.log.slice(-3), ["read saved_searches", `read saved_searches by ${column}`, `update saved_searches by ${column}`]);
    assert.equal(restoration.updates[0]!.deletedAt, null);

    for (const { updates, inserted } of [edit, seen, removal, restoration]) {
      assert.deepEqual(inserted, []);
      assert.ok(updates.every((values) => !("workspaceId" in values) && !("userId" in values)));
    }
    answers.push(withoutClock([edited, marked, restored]));
  }
  assert.deepEqual(answers[1], answers[0]);
});

test("in workspaces a saved search of the user outside the default workspace does not exist", async () => {
  for (const workspaceId of [null, `ws_${"b".repeat(32)}`]) {
    const { database, updates } = recordingDatabase("workspaces", { searches: [stored({ workspaceId })] });
    await assert.rejects(updateSavedSearch({ userId: "user-1", id: "search-1", name: "Notebooks" }, database), NotFoundError);
    await assert.rejects(deleteSavedSearch("user-1", "search-1", database), NotFoundError);
    await assert.rejects(restoreSavedSearch("user-1", "search-1", database), NotFoundError);
    await assert.rejects(markSavedSearchSeen("user-1", "search-1", database), NotFoundError);
    assert.deepEqual(updates, []);
  }
});

test("marking notifications as read keeps rows without a workspace in reach in workspaces", async () => {
  const legacy = recordingDatabase("legacy");
  const legacyAnswer = await markNotificationsRead({ userId: "user-1", all: true }, legacy.database);
  assert.deepEqual(legacy.log, ["update notifications by user_id", "read notifications by user_id"]);

  const workspaces = recordingDatabase("workspaces");
  const answer = await markNotificationsRead({ userId: "user-1", ids: ["n-1"] }, workspaces.database);
  assert.deepEqual(workspaces.log, [
    "read workspace_members",
    "update notifications by user_id and workspace_id or no workspace",
    "read notifications by user_id and workspace_id or no workspace",
  ]);
  assert.deepEqual(Object.keys(workspaces.updates[0]!), ["readAt"], "reading never moves the row");
  assert.deepEqual(answer, { unreadCount: 2 });
  assert.deepEqual(legacyAnswer, answer);
});

test("paused writes answer 503 in both modes before any table is touched", async () => {
  for (const mode of ["legacy", "workspaces"] as const) {
    const { database, log } = recordingDatabase(mode, { writesPaused: true, searches: [stored()] });
    const refused = [
      createSavedSearch({ userId: "user-1", name: "Computadores", query: "q=computadores", alertsEnabled: false }, database),
      updateSavedSearch({ userId: "user-1", id: "search-1", name: "Notebooks" }, database),
      deleteSavedSearch("user-1", "search-1", database),
      restoreSavedSearch("user-1", "search-1", database),
      markSavedSearchSeen("user-1", "search-1", database),
      markNotificationsRead({ userId: "user-1", all: true }, database),
    ];
    for (const mutation of refused) await assert.rejects(mutation, MaintenanceInProgressError);
    assert.deepEqual(log, []);
  }
});
