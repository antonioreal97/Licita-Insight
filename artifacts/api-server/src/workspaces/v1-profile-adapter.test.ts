import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.LOG_LEVEL = "silent";
const { deleteCompanyProfile, parseCompanyProfileInput, putCompanyProfile } = await import(
  "../ai/company-fit-service"
);
const { updateRecommendationPreferences } = await import("../recommendations/recommendation-service");
const { MaintenanceInProgressError } = await import("../lib/api-error");

type GateDatabase = NonNullable<Parameters<typeof putCompanyProfile>[3]>;

const dialect = new PgDialect();
const WORKSPACE_ID = `ws_${"a".repeat(32)}`;

/**
 * A gated transaction that records which table each query builder touches and answers selects from `rows` (keyed by
 * the table in `from`), `returning()` with the inserted values, and the gate statements like PostgreSQL would.
 */
const recordingDatabase = (mode: "legacy" | "workspaces", writesPaused = false) => {
  const touched: string[] = [];
  const rows: Record<string, unknown[]> = {
    company_profiles: [],
    workspace_profiles: [],
    workspace_members: [{ id: WORKSPACE_ID, showInternationalOpportunities: false }],
    users: [{ showInternationalOpportunities: false }],
  };
  const chain = (result: () => unknown[], onCall: (method: string, args: unknown[]) => void = () => {}) => {
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
      if (text.includes("workspace_cutover_events")) return { rows: [{ mode, writes_paused: writesPaused }] };
      return { rows: [] };
    },
    select: () => {
      let table = "";
      return chain(
        () => rows[table] ?? [],
        (method, args) => {
          if (method === "from") touched.push(`read ${(table = getTableName(args[0] as Table))}`);
          if (method === "innerJoin") touched.push(`read ${getTableName(args[0] as Table)}`);
        },
      );
    },
    insert: (table: Table) => {
      touched.push(`insert ${getTableName(table)}`);
      let values: unknown;
      return chain(
        () => [values],
        (method, args) => {
          if (method === "values") values = args[0];
        },
      );
    },
    update: (table: Table) => {
      const name = getTableName(table);
      return chain(
        () => rows[name] ?? [],
        (method, args) => {
          if (method === "set") touched.push(`update ${name} ${Object.keys(args[0] as object).sort().join(",")}`);
        },
      );
    },
    delete: (table: Table) => {
      touched.push(`delete ${getTableName(table)}`);
      return chain(() => []);
    },
  };
  const database = {
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as GateDatabase;
  return { database, touched };
};

const input = parseCompanyProfileInput({
  description: "Fornecemos equipamentos de informática e suporte técnico corporativo.",
  offerings: ["computadores", "suporte técnico"],
  exclusions: [],
  selectedCategories: [],
  selectedKeywords: [],
  excludedKeywords: [],
  coverage: { scope: "national", mode: "strict", acceptsRemote: false },
  valueRange: { min: null, max: 1000 },
  size: "other",
});
const now = new Date("2026-10-13T12:00:00.000Z");
const workspaceTable = (entry: string) => /^\w+ (workspaces|workspace_\w+)\b/.test(entry);

test("legacy profile save writes company_profiles and never a workspace table", async () => {
  const { database, touched } = recordingDatabase("legacy");
  const profile = await putCompanyProfile("user-1", input, now, database);
  assert.equal(profile.version, 1);
  assert.deepEqual(touched, ["read company_profiles", "delete company_tender_fits", "insert company_profiles"]);
});

test("workspaces profile save writes the default workspace profile and never company_profiles", async () => {
  const { database, touched } = recordingDatabase("workspaces");
  const profile = await putCompanyProfile("user-1", input, now, database);
  assert.equal(profile.version, 1);
  assert.equal(profile.updatedAt.toISOString(), now.toISOString());
  assert.deepEqual(touched, [
    "read workspace_members",
    "read workspaces",
    "read workspace_profiles",
    "insert workspace_profiles",
    "delete company_tender_fits",
    "delete workspace_profile_signals",
    "insert workspace_profile_signals",
    "update workspaces onboardingStatus,updatedAt",
  ]);
});

test("profile delete follows the mode", async () => {
  const legacy = recordingDatabase("legacy");
  await deleteCompanyProfile("user-1", now, legacy.database);
  assert.deepEqual(legacy.touched, ["delete company_tender_fits", "delete company_profiles"]);

  const workspaces = recordingDatabase("workspaces");
  await deleteCompanyProfile("user-1", now, workspaces.database);
  assert.equal(workspaces.touched.includes("delete company_profiles"), false);
  assert.deepEqual(workspaces.touched.slice(2), [
    "delete company_tender_fits",
    "delete workspace_profile_signals",
    "delete workspace_profiles",
    "update workspaces onboardingStatus,updatedAt",
  ]);
});

test("the international preference goes to users in legacy and to the default workspace in workspaces", async () => {
  const legacy = recordingDatabase("legacy");
  const legacySaved = await updateRecommendationPreferences("user-1", true, false, now, true, legacy.database);
  assert.equal(legacy.touched.some(workspaceTable), false);
  assert.deepEqual(legacy.touched, [
    "update users recommendationPersonalizationEnabled,recommendationPreferencesUpdatedAt,showInternationalOpportunities,updatedAt",
  ]);
  assert.equal(legacySaved.showInternationalOpportunities, false, "legacy answers what users returned");

  const workspaces = recordingDatabase("workspaces");
  const saved = await updateRecommendationPreferences("user-1", true, false, now, true, workspaces.database);
  assert.deepEqual(workspaces.touched, [
    "update users recommendationPersonalizationEnabled,recommendationPreferencesUpdatedAt,updatedAt",
    "read workspace_members",
    "read workspaces",
    "update workspaces showInternationalOpportunities,updatedAt",
  ]);
  assert.equal(saved.showInternationalOpportunities, true);
});

test("paused writes answer 503 in both modes before any table is touched", async () => {
  for (const mode of ["legacy", "workspaces"] as const) {
    const { database, touched } = recordingDatabase(mode, true);
    await assert.rejects(putCompanyProfile("user-1", input, now, database), MaintenanceInProgressError);
    await assert.rejects(deleteCompanyProfile("user-1", now, database), MaintenanceInProgressError);
    assert.deepEqual(touched, []);
  }
});
