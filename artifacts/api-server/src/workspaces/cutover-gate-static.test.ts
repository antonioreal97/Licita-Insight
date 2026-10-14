import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { getTableName } from "drizzle-orm";
import * as schema from "@workspace/db/schema";

/**
 * Static checks of the cutover contract (docs/contracts/workspace-cutover-v1.md, "Matriz de testes"), over the
 * source text of the API: no database, so they can run at every merge of `main` into the integration branch.
 *
 * It is a text scan, not a type check. A write is "behind the gate" when the nearest transaction scope above it in
 * the file is `withCutoverGate`, `enterCutoverGate` or a parameter typed `GateTransaction`. A write on `db`/`pool`,
 * or under a plain `.transaction(` / a `Transaction` parameter, is reported with its file and line. What the scan
 * cannot see is listed in GATE_EXCEPTIONS, each with the reason it is safe.
 */
const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every table the gate covers; `users` is covered only when an account is created (its inserts). */
const SCOPED_TABLES = {
  companyProfilesTable: schema.companyProfilesTable,
  companyTenderFitsTable: schema.companyTenderFitsTable,
  savedTendersTable: schema.savedTendersTable,
  savedSearchesTable: schema.savedSearchesTable,
  notificationsTable: schema.notificationsTable,
  emailDeliveriesTable: schema.emailDeliveriesTable,
  emailDeliveryNotificationsTable: schema.emailDeliveryNotificationsTable,
  recommendationEventsTable: schema.recommendationEventsTable,
  recommendationDismissalsTable: schema.recommendationDismissalsTable,
  recommendationInterestProfilesTable: schema.recommendationInterestProfilesTable,
  userRecommendationsTable: schema.userRecommendationsTable,
  aiJobsTable: schema.aiJobsTable,
  workspacesTable: schema.workspacesTable,
  workspaceMembersTable: schema.workspaceMembersTable,
  workspaceProfilesTable: schema.workspaceProfilesTable,
  workspaceProfileSignalsTable: schema.workspaceProfileSignalsTable,
  userWorkspacePreferencesTable: schema.userWorkspacePreferencesTable,
} as const;
const INSERT_ONLY_TABLES = { usersTable: schema.usersTable } as const;

type Write = { file: string; line: number; operation: string; table: string; receiver: string; scope: string };

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });

const GATED = /withCutoverGate\s*\(|enterCutoverGate\s*\(|:\s*GateTransaction\b/g;
const UNGATED = /\b\w+\.transaction\s*\(|:\s*Transaction\b|\bpool\.connect\s*\(/g;
const lastIndexOf = (pattern: RegExp, text: string): number => {
  let index = -1;
  for (const match of text.matchAll(pattern)) index = match.index;
  return index;
};
/** The transaction scope a write at `index` runs in: the nearest opener above it in the file. */
const scopeAt = (text: string, index: number): string => {
  const above = text.slice(0, index);
  const gated = lastIndexOf(GATED, above);
  const ungated = lastIndexOf(UNGATED, above);
  if (gated === -1 && ungated === -1) return "none";
  return gated > ungated ? "gate" : "transaction";
};

/** Every write of the source to `tables`, through the query builder or in raw SQL. */
const writesTo = (
  tables: Record<string, Parameters<typeof getTableName>[0]>,
  operations = "insert|update|delete",
): Write[] => {
  const identifiers = Object.keys(tables).join("|");
  const sqlNames = Object.values(tables).map((table) => getTableName(table)).join("|");
  const builder = new RegExp(`(\\w+)\\s*\\.(${operations})\\(\\s*(${identifiers})\\s*\\)`, "g");
  const raw = new RegExp(`\\b(${operations.replace("insert", "insert\\s+into").replace("delete", "delete\\s+from")})\\s+"?(${sqlNames})"?\\b`, "gi");
  return sourceFiles(SOURCE_ROOT).flatMap((full) => {
    const text = readFileSync(full, "utf8");
    const file = path.relative(SOURCE_ROOT, full);
    const lineOf = (index: number) => text.slice(0, index).split("\n").length;
    const found: Write[] = [];
    for (const match of text.matchAll(builder)) {
      found.push({ file, line: lineOf(match.index), operation: match[2]!, table: getTableName(tables[match[3]!]!), receiver: match[1]!, scope: scopeAt(text, match.index) });
    }
    for (const match of text.matchAll(raw)) {
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      if (/^\s*(\/\/|\*|\/\*)/.test(text.slice(lineStart, match.index))) continue;
      const callers = [...text.slice(Math.max(0, match.index - 800), match.index).matchAll(/(\w+)\s*\.(?:query|execute)\s*(?:<[^>]*>)?\s*\(/g)];
      found.push({
        file,
        line: lineOf(match.index),
        operation: match[1]!.toLowerCase().split(/\s+/)[0]!,
        table: match[2]!.toLowerCase(),
        receiver: callers.at(-1)?.[1] ?? "?",
        scope: scopeAt(text, match.index),
      });
    }
    return found;
  });
};

const outsideGate = (write: Write) => write.receiver === "db" || write.receiver === "pool" || write.scope !== "gate";
const describe = (write: Write) => {
  const direct = write.receiver === "db" || write.receiver === "pool";
  const why = direct ? "outside any transaction" : write.scope === "none" ? "no transaction scope above it" : "transaction without the gate";
  return `${write.file}:${write.line} ${write.operation} ${write.table} on \`${write.receiver}\` (${why})`;
};

/**
 * Writes the scan reports that are safe. `file` + `table` must match at least one report, so an exception that no
 * longer applies fails the test and gets removed.
 */
const GATE_EXCEPTIONS: Array<{ file: string; table: string; reason: string }> = [
  {
    file: "account/notification-service.ts",
    table: "notifications",
    reason:
      "Tender-change and new-document notifications run in the collection's transaction, which is the tender upsert. " +
      "monitoringSubscribers() takes the gate on that same transaction with enterCutoverGate before it reads who " +
      "monitors the tender, and these inserts come right after it.",
  },
  {
    file: "ai/ai-job-queue.ts",
    table: "ai_jobs",
    reason:
      "Queue bookkeeping shared by every job kind: claim, heartbeat, complete, fail, requeue and recovery only touch " +
      "status, attempts and lock columns. A fit job is inserted inside the caller's gated transaction (ensureFit " +
      "passes its tx), its result is written through the gate, and the drain query waits for running fit jobs.",
  },
  {
    file: "auth/session-service.ts",
    table: "users",
    reason:
      "signInGoogleUser inserts the user only when createIn is set, and only the gated call in upsertGoogleUser sets " +
      "it. The first, ungated call passes null and returns before the insert.",
  },
];

test("no write to a table of the workspace scope outside the cutover gate", () => {
  const reported = [...writesTo(SCOPED_TABLES), ...writesTo(INSERT_ONLY_TABLES, "insert")].filter(outsideGate);
  const excepted = (write: Write) => GATE_EXCEPTIONS.some((exception) => exception.file === write.file && exception.table === write.table);
  const violations = reported.filter((write) => !excepted(write)).map(describe);
  assert.deepEqual(violations, [], `Writes in the workspace scope outside withCutoverGate/enterCutoverGate:\n${violations.join("\n")}\n`);
  const unused = GATE_EXCEPTIONS.filter((exception) => !reported.some((write) => exception.file === write.file && exception.table === write.table));
  assert.deepEqual(unused.map(({ file, table }) => `${file} ${table}`), [], "exceptions that no longer match any write");
});

test("the application never writes to the cutover flag table", () => {
  const writes = writesTo({ workspaceCutoverEventsTable: schema.workspaceCutoverEventsTable }).map(describe);
  assert.deepEqual(writes, [], `Only the owner's cutover tool changes workspace_cutover_events:\n${writes.join("\n")}\n`);
});

test("the scan sees the gated writes it is meant to judge", () => {
  const all = writesTo(SCOPED_TABLES);
  for (const table of Object.values(SCOPED_TABLES).map((table) => getTableName(table))) {
    assert.ok(all.some((write) => write.table === table), `no write to ${table} found: the scan lost track of it`);
  }
  assert.ok(all.filter((write) => !outsideGate(write)).length > 30, "most writes of the scope are behind the gate");
});
