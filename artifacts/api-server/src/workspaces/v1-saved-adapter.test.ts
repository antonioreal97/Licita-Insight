import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.LOG_LEVEL = "silent";
const { deleteSavedTender, importSavedTenders, putSavedTender } = await import("../account/account-service");
const { MaintenanceInProgressError } = await import("../lib/api-error");

type GateDatabase = NonNullable<Parameters<typeof putSavedTender>[1]>;
type Mode = "legacy" | "workspaces";

const dialect = new PgDialect();
const WORKSPACE_ID = `ws_${"a".repeat(32)}`;
const TENDER_ID = "tender-1";
const at = new Date("2026-10-01T12:00:00.000Z");

const tender = {
  id: TENDER_ID,
  title: "Aquisição de computadores TEST DATA",
  displayTitle: null,
  displayTitleSource: "rules",
  objectSummary: null,
  organizationId: "org-1",
  organizationName: "Órgão de teste",
  purchasingUnit: null,
  modality: "pregao_eletronico",
  modalityLabel: "Pregão - Eletrônico",
  status: "open",
  tenderNumber: "1/2026",
  estimatedValue: null,
  estimatedValueStatus: "informed",
  estimatedValueFlag: null,
  publishedAt: at,
  openingAt: null,
  proposalDeadline: null,
  state: "DF",
  city: "Brasília",
  cityIbgeCode: null,
  sourceId: "test",
  sourceName: "Teste",
  sourceUrl: "https://example.test/1",
  platform: null,
  platformLabel: null,
  categories: [],
  updatedAt: at,
  createdAt: at,
  description: null,
  processNumber: null,
  items: [],
  documents: [],
  timeline: [],
  rawPayload: {},
  detailsFetchedAt: at,
};

const stored = {
  userId: "user-1",
  tenderId: TENDER_ID,
  savedAt: at,
  monitored: true,
  monitoredAt: at,
  stage: "participating",
  stageAt: at,
  protocol: "PROTO-1",
  nextAction: "Enviar proposta",
  nextActionDeadline: new Date("2026-11-01T12:00:00.000Z"),
  checklist: [{ key: "samples", state: "have", note: "ok", updatedAt: at.toISOString() }],
  history: [{ from: null, to: "participating", at: at.toISOString(), source: "user" }],
};

/**
 * A gated transaction that records each query as `<operation> <table> [by <scope column>]`, answers selects from
 * `rows` (keyed by the table in `from`) and `returning()` with the written values, and the gate statements like
 * PostgreSQL would.
 */
const recordingDatabase = (mode: Mode, options: { writesPaused?: boolean; saved?: unknown[] } = {}) => {
  const log: string[] = [];
  const inserted: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const rows: Record<string, unknown[]> = {
    tenders: [tender],
    saved_tenders: options.saved ?? [],
    workspace_members: [{ id: WORKSPACE_ID, showInternationalOpportunities: false }],
  };
  const scope = (where: SQL): string => {
    const text = dialect.sqlToQuery(where).sql;
    if (text.includes('"saved_tenders"."workspace_id"')) return " by workspace_id";
    return text.includes('"saved_tenders"."user_id"') ? " by user_id" : "";
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
    delete: (table: Table) =>
      chain(
        () => [],
        (method, args) => {
          if (method === "where") log.push(`delete ${getTableName(table)}${scope(args[0] as SQL)}`);
        },
      ),
  };
  const database = {
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as GateDatabase;
  return { database, log, inserted, updates };
};

/** `savedAt`, `stageAt` and the history entry come from the clock of each call. */
const withoutClock = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (key, entry) => (/(At|^at)$/.test(key) ? "<varies>" : entry)));

test("a new saved tender is keyed by the user in legacy and stamped with the default workspace in workspaces", async () => {
  const legacy = recordingDatabase("legacy");
  const legacySaved = await putSavedTender({ userId: "user-1", tenderId: TENDER_ID, stage: "submitted" }, legacy.database);
  assert.deepEqual(legacy.log, [
    "read tenders",
    "read saved_tenders by user_id",
    "read saved_tenders by user_id",
    "insert saved_tenders",
  ]);
  assert.equal("workspaceId" in legacy.inserted[0]!, false, "legacy writes today's row");

  const workspaces = recordingDatabase("workspaces");
  const saved = await putSavedTender({ userId: "user-1", tenderId: TENDER_ID, stage: "submitted" }, workspaces.database);
  assert.deepEqual(workspaces.log, [
    "read workspace_members",
    "read tenders",
    "read saved_tenders by workspace_id",
    "read saved_tenders by workspace_id",
    "insert saved_tenders",
  ]);
  assert.equal(workspaces.inserted[0]!.workspaceId, WORKSPACE_ID);
  assert.equal(workspaces.inserted[0]!.userId, "user-1", "the legacy key is still written until W4");

  assert.equal(saved.stage, "submitted");
  assert.equal(saved.monitored, true);
  assert.deepEqual(withoutClock(saved), withoutClock(legacySaved));
});

test("updating a saved tender keeps every participation field in both modes", async () => {
  const answers = [];
  for (const mode of ["legacy", "workspaces"] as const) {
    const { database, log, inserted, updates } = recordingDatabase(mode, { saved: [stored] });
    const saved = await putSavedTender({ userId: "user-1", tenderId: TENDER_ID, nextAction: "Assinar contrato" }, database);
    const column = mode === "legacy" ? "user_id" : "workspace_id";
    assert.deepEqual(log.slice(-3), ["read tenders", `read saved_tenders by ${column}`, `update saved_tenders by ${column}`]);
    assert.deepEqual(inserted, []);
    assert.equal("workspaceId" in updates[0]! || "userId" in updates[0]!, false, "an update never moves the row");
    assert.equal(saved.nextAction, "Assinar contrato");
    assert.equal(saved.protocol, "PROTO-1");
    assert.equal(saved.stage, "participating");
    assert.equal(saved.monitored, true);
    assert.equal(saved.checklist[0]!.note, "ok");
    assert.equal(saved.history.length, 1);
    answers.push(saved);
  }
  assert.deepEqual(answers[1], answers[0]);
});

test("removing and importing saved tenders follow the mode", async () => {
  const legacy = recordingDatabase("legacy");
  await deleteSavedTender("user-1", TENDER_ID, legacy.database);
  const legacyImport = await importSavedTenders("user-1", [TENDER_ID, TENDER_ID, "missing"], legacy.database);
  assert.deepEqual(legacy.log, [
    "delete saved_tenders by user_id",
    "read saved_tenders by user_id",
    "read tenders",
    "read saved_tenders by user_id",
    "insert saved_tenders",
  ]);
  assert.deepEqual(legacy.inserted, [{ userId: "user-1", tenderId: TENDER_ID }]);

  const workspaces = recordingDatabase("workspaces");
  await deleteSavedTender("user-1", TENDER_ID, workspaces.database);
  const workspacesImport = await importSavedTenders("user-1", [TENDER_ID, TENDER_ID, "missing"], workspaces.database);
  assert.deepEqual(workspaces.log, [
    "read workspace_members",
    "delete saved_tenders by workspace_id",
    "read workspace_members",
    "read saved_tenders by workspace_id",
    "read tenders",
    "read saved_tenders by workspace_id",
    "insert saved_tenders",
  ]);
  assert.deepEqual(workspaces.inserted, [{ userId: "user-1", workspaceId: WORKSPACE_ID, tenderId: TENDER_ID }]);

  assert.deepEqual(legacyImport, { imported: 1, alreadySaved: 0, notFound: ["missing"], skippedByLimit: 0 });
  assert.deepEqual(workspacesImport, legacyImport);
});

test("paused writes answer 503 in both modes before any table is touched", async () => {
  for (const mode of ["legacy", "workspaces"] as const) {
    const { database, log } = recordingDatabase(mode, { writesPaused: true });
    await assert.rejects(putSavedTender({ userId: "user-1", tenderId: TENDER_ID }, database), MaintenanceInProgressError);
    await assert.rejects(deleteSavedTender("user-1", TENDER_ID, database), MaintenanceInProgressError);
    await assert.rejects(importSavedTenders("user-1", [TENDER_ID], database), MaintenanceInProgressError);
    assert.deepEqual(log, []);
  }
});
