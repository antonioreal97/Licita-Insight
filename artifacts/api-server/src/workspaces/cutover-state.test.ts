import assert from "node:assert/strict";
import test from "node:test";
import { cutoverStateFromRow, missingWorkspaceSchema, readCutoverState } from "./cutover-state";

test("an empty cutover table means legacy with writes allowed", () => {
  assert.deepEqual(cutoverStateFromRow(undefined), { mode: "legacy", writesPaused: false });
});

test("the latest cutover row is the state", () => {
  assert.deepEqual(cutoverStateFromRow({ mode: "workspaces", writes_paused: true }), {
    mode: "workspaces",
    writesPaused: true,
  });
  assert.deepEqual(cutoverStateFromRow({ mode: "legacy", writes_paused: false }), {
    mode: "legacy",
    writesPaused: false,
  });
});

test("an unknown mode is an error, never a guess", () => {
  assert.throws(() => cutoverStateFromRow({ mode: "hybrid", writes_paused: false }), /unknown mode "hybrid"/);
});

test("reading the state asks for the latest row and propagates database errors", async () => {
  const statements: string[] = [];
  const state = await readCutoverState({
    query: async (text: string) => {
      statements.push(text);
      return { rows: [] };
    },
  } as never);
  assert.deepEqual(state, { mode: "legacy", writesPaused: false });
  assert.match(statements[0]!, /from workspace_cutover_events order by id desc limit 1/);

  const failing = { query: async () => Promise.reject(new Error("permission denied for table workspace_cutover_events")) };
  await assert.rejects(readCutoverState(failing as never), /permission denied/);
});

test("the startup check lists every missing table and workspace_id column", () => {
  const missing = missingWorkspaceSchema([
    { table_name: "workspaces", column_name: "id" },
    { table_name: "saved_tenders", column_name: "workspace_id" },
    { table_name: "notifications", column_name: "id" },
  ]);
  assert.ok(missing.includes("table workspace_cutover_events"));
  assert.ok(missing.includes("table workspace_members"));
  assert.ok(missing.includes("column notifications.workspace_id"));
  assert.ok(missing.includes("column ai_jobs.workspace_id"));
  assert.equal(missing.includes("table workspaces"), false);
  assert.equal(missing.includes("column saved_tenders.workspace_id"), false);
  assert.equal(missing.length, 5 + 10);
});
