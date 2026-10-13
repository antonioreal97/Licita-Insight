import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.LOG_LEVEL = "silent";
const { upsertDevUser, upsertGoogleUser } = await import("../auth/session-service");
const { MaintenanceInProgressError } = await import("../lib/api-error");
const { DEFAULT_WORKSPACE_NAME, defaultWorkspaceId } = await import("./workspace-service");

type GateDatabase = NonNullable<Parameters<typeof upsertGoogleUser>[3]>;
type Mode = "legacy" | "workspaces";

const dialect = new PgDialect();
const now = new Date("2026-10-13T12:00:00.000Z");
const identity = { sub: "google-sub-1", email: "nova@example.test", name: "TEST USER", picture: null };
const known = {
  id: "user-known",
  googleSub: identity.sub,
  email: identity.email,
  name: "TEST USER",
  avatarUrl: null,
  trialEndsAt: new Date("2026-10-27T12:00:00.000Z"),
  createdAt: now,
};
const WORKSPACE_TABLES = ["workspaces", "workspace_members", "user_workspace_preferences"];

/**
 * A database whose transactions record `gate` when the cutover gate is taken and each query as `<operation> <table>`.
 * The account exists only when `account` says so; `returning()` answers with the written values.
 */
const recordingDatabase = (
  mode: Mode,
  options: { writesPaused?: boolean; account?: typeof known; insertedByAnother?: boolean } = {},
) => {
  const log: string[] = [];
  const written: Record<string, Array<Record<string, unknown>>> = {};
  const rows = (table: string): unknown[] => (table === "users" && options.account ? [options.account] : []);
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
      if (text.includes("advisory_xact_lock_shared")) {
        log.push("gate");
        return { rows: [{ acquired: true, isolation: "read committed" }] };
      }
      if (text.includes("workspace_cutover_events")) {
        return { rows: [{ mode, writes_paused: options.writesPaused ?? false }] };
      }
      return { rows: [] };
    },
    select: () => {
      let table = "";
      return chain(
        () => rows(table),
        (method, args) => {
          if (method === "from") log.push(`read ${(table = getTableName(args[0] as Table))}`);
        },
      );
    },
    insert: (table: Table) => {
      const name = getTableName(table);
      let values: Record<string, unknown> = {};
      return chain(
        () => [{ onboardingStatus: "not_started", archivedAt: null, ...values, inserted: !options.insertedByAnother }],
        (method, args) => {
          if (method !== "values") return;
          values = args[0] as Record<string, unknown>;
          (written[name] ??= []).push(values);
          log.push(`insert ${name}`);
        },
      );
    },
    update: (table: Table) => {
      const name = getTableName(table);
      let values: Record<string, unknown> = {};
      return chain(
        () => rows(name).map((row) => ({ ...(row as object), ...values })),
        (method, args) => {
          if (method === "set") values = args[0] as Record<string, unknown>;
          if (method === "where") log.push(`update ${name}`);
        },
      );
    },
  };
  const database = {
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as GateDatabase;
  const touched = (tables: string[]) => log.filter((entry) => tables.some((table) => entry.endsWith(` ${table}`)));
  return { database, log, written, touched };
};

test("a returning Google account signs in outside the gate, even while writes are paused", async () => {
  for (const mode of ["legacy", "workspaces"] as const) {
    const { database, log, touched } = recordingDatabase(mode, { account: known, writesPaused: true });
    const user = await upsertGoogleUser(identity, now, "secret", database);
    assert.equal(user.id, known.id);
    assert.deepEqual(log, ["read users", "insert google_trial_tombstones", "update users"]);
    assert.deepEqual(touched(WORKSPACE_TABLES), []);
  }
});

test("a new Google account goes through the gate; in workspaces it is born with its default workspace", async () => {
  const legacy = recordingDatabase("legacy");
  const legacyUser = await upsertGoogleUser(identity, now, "secret", legacy.database);
  assert.deepEqual(legacy.log, [
    "read users",
    "read users",
    "gate",
    "read users",
    "read users",
    "insert google_trial_tombstones",
    "insert users",
  ]);
  assert.equal(legacy.written.users![0]!.id, legacyUser.id);

  const workspaces = recordingDatabase("workspaces");
  const user = await upsertGoogleUser(identity, now, "secret", workspaces.database);
  assert.deepEqual(workspaces.log.slice(0, 7), legacy.log);
  assert.deepEqual(workspaces.touched(WORKSPACE_TABLES).filter((entry) => !entry.startsWith("read")), [
    "insert workspaces",
    "insert workspace_members",
    "update workspace_members",
    "insert user_workspace_preferences",
  ]);
  const workspaceId = defaultWorkspaceId(user.id);
  const [workspace] = workspaces.written.workspaces!;
  assert.deepEqual(
    [workspace!.id, workspace!.type, workspace!.name, workspace!.ownerUserId, workspace!.isDefault, workspace!.limitSlot],
    [workspaceId, "procurement", DEFAULT_WORKSPACE_NAME, user.id, true, 1],
    "the same workspace the W3 backfill gives an existing account",
  );
  assert.deepEqual(workspaces.written.workspace_members, [{ workspaceId, userId: user.id, role: "owner", createdAt: now }]);
  assert.deepEqual(workspaces.written.user_workspace_preferences, [{ userId: user.id, activeWorkspaceId: workspaceId, updatedAt: now }]);
});

test("the development login follows the same split", async () => {
  const returning = recordingDatabase("workspaces", { account: known, writesPaused: true });
  assert.equal((await upsertDevUser({ email: identity.email, name: "TEST USER" }, now, returning.database)).id, known.id);
  assert.deepEqual(returning.log, ["update users"]);

  const legacy = recordingDatabase("legacy");
  await upsertDevUser({ email: identity.email, name: "TEST USER" }, now, legacy.database);
  assert.deepEqual(legacy.log, ["update users", "gate", "insert users"]);

  const workspaces = recordingDatabase("workspaces");
  const user = await upsertDevUser({ email: " Nova@Example.Test ", name: "TEST USER" }, now, workspaces.database);
  assert.equal(workspaces.written.users![0]!.email, "nova@example.test");
  assert.equal(workspaces.written.workspaces![0]!.id, defaultWorkspaceId(user.id));
  assert.equal(workspaces.written.user_workspace_preferences![0]!.activeWorkspaceId, defaultWorkspaceId(user.id));

  // The upsert met the row a concurrent first login had just inserted: that login already created the workspace.
  const raced = recordingDatabase("workspaces", { insertedByAnother: true });
  await upsertDevUser({ email: identity.email, name: "TEST USER" }, now, raced.database);
  assert.deepEqual(raced.touched(WORKSPACE_TABLES), []);
});

test("while writes are paused a new account is refused before anything is written", async () => {
  for (const mode of ["legacy", "workspaces"] as const) {
    const google = recordingDatabase(mode, { writesPaused: true });
    await assert.rejects(upsertGoogleUser(identity, now, "secret", google.database), MaintenanceInProgressError);
    assert.deepEqual(google.log, ["read users", "read users", "gate"]);

    const development = recordingDatabase(mode, { writesPaused: true });
    await assert.rejects(upsertDevUser({ email: identity.email, name: null }, now, development.database), MaintenanceInProgressError);
    assert.deepEqual(development.written, {});
  }
});
