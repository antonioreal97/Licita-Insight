import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const {
  assertWorkspaceWritable,
  defaultWorkspaceId,
  isWorkspaceId,
  resolveActiveWorkspace,
  workspaceAccessModes,
  workspaceLimit,
} = await import("./workspace-service");
const { WorkspaceArchivedError, WorkspaceReadOnlyError } = await import("../lib/api-error");

const archived = new Date("2026-10-01T00:00:00Z");

test("limit is 1 without entitlement and 5 with any current entitlement", () => {
  assert.equal(workspaceLimit(null), 1);
  for (const source of ["subscription", "trial", "coupon", "beta", "dev"] as const) {
    assert.equal(workspaceLimit(source), 5);
  }
});

test("after a downgrade only the lowest non-archived slot stays writable", () => {
  const modes = workspaceAccessModes(
    [
      { id: "slot-3", limitSlot: 3, archivedAt: null },
      { id: "slot-1", limitSlot: 1, archivedAt: archived },
      { id: "slot-2", limitSlot: 2, archivedAt: null },
      { id: "slot-5", limitSlot: 5, archivedAt: null },
    ],
    1,
  );
  assert.deepEqual(Object.fromEntries(modes), {
    "slot-3": "read_only",
    "slot-1": "read_only",
    "slot-2": "write",
    "slot-5": "read_only",
  });
});

test("with entitlement every non-archived workspace up to 5 is writable; archived never are", () => {
  const modes = workspaceAccessModes(
    [
      ...[1, 2, 3, 4, 5].map((slot) => ({ id: `slot-${slot}`, limitSlot: slot, archivedAt: null })),
      { id: "slot-6", limitSlot: 6, archivedAt: archived },
    ],
    5,
  );
  assert.deepEqual([...modes.values()], ["write", "write", "write", "write", "write", "read_only"]);
});

test("restoring an archived lower slot takes the writable place back", () => {
  const before = workspaceAccessModes(
    [
      { id: "a", limitSlot: 1, archivedAt: archived },
      { id: "b", limitSlot: 2, archivedAt: null },
    ],
    1,
  );
  const after = workspaceAccessModes(
    [
      { id: "a", limitSlot: 1, archivedAt: null },
      { id: "b", limitSlot: 2, archivedAt: null },
    ],
    1,
  );
  assert.equal(before.get("b"), "write");
  assert.equal(after.get("a"), "write");
  assert.equal(after.get("b"), "read_only");
});

const workspace = (
  id: string,
  overrides: Partial<{
    archivedAt: Date | null;
    accessMode: "write" | "read_only";
    lastSelectedAt: Date | null;
    createdAt: Date;
  }> = {},
) => ({
  id,
  archivedAt: null,
  accessMode: "write" as const,
  lastSelectedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

test("a valid preference is kept, including a read-only workspace", () => {
  const workspaces = [workspace("a"), workspace("b", { accessMode: "read_only" })];
  assert.equal(resolveActiveWorkspace("b", workspaces), "b");
});

test("an archived, deleted or foreign preference resolves to the most recently selected writable workspace", () => {
  const workspaces = [
    workspace("archived", { archivedAt: archived, lastSelectedAt: new Date("2026-10-10T00:00:00Z") }),
    workspace("older", { lastSelectedAt: new Date("2026-10-01T00:00:00Z") }),
    workspace("newer", { lastSelectedAt: new Date("2026-10-05T00:00:00Z") }),
    workspace("read-only", { accessMode: "read_only", lastSelectedAt: new Date("2026-10-09T00:00:00Z") }),
    workspace("never"),
  ];
  for (const preferred of ["archived", "ws_deleted", "ws_of_someone_else", null]) {
    assert.equal(resolveActiveWorkspace(preferred, workspaces), "newer");
  }
});

test("without selection history the oldest wins, then the lowest id", () => {
  assert.equal(
    resolveActiveWorkspace(null, [
      workspace("b", { createdAt: new Date("2026-02-01T00:00:00Z") }),
      workspace("c", { createdAt: new Date("2026-01-01T00:00:00Z") }),
    ]),
    "c",
  );
  assert.equal(resolveActiveWorkspace(null, [workspace("b"), workspace("a")]), "a");
  const sameMoment = new Date("2026-10-01T00:00:00Z");
  assert.equal(
    resolveActiveWorkspace(null, [
      workspace("z", { lastSelectedAt: sameMoment }),
      workspace("y", { lastSelectedAt: sameMoment }),
    ]),
    "y",
  );
});

test("no non-archived workspace resolves to null", () => {
  assert.equal(resolveActiveWorkspace("a", [workspace("a", { archivedAt: archived })]), null);
  assert.equal(resolveActiveWorkspace(null, []), null);
});

test("workspace ids are opaque ws_ + 32 hex; the default one is deterministic per user", () => {
  assert.equal(isWorkspaceId(defaultWorkspaceId("user-1")), true);
  assert.equal(defaultWorkspaceId("user-1"), defaultWorkspaceId("user-1"));
  assert.notEqual(defaultWorkspaceId("user-1"), defaultWorkspaceId("user-2"));
  for (const malformed of ["", "ws_", "ws_XYZ", `ws_${"a".repeat(31)}`, `WS_${"a".repeat(32)}`, "1 or 1=1"]) {
    assert.equal(isWorkspaceId(malformed), false);
  }
});

test("archived answers 409 before read-only answers 402", () => {
  const member = {
    workspaceId: defaultWorkspaceId("user-1"),
    type: "procurement" as const,
    role: "owner" as const,
    ownerUserId: "user-1",
  };
  assert.throws(
    () => assertWorkspaceWritable({ ...member, archivedAt: archived, accessMode: "read_only" }),
    (error) => error instanceof WorkspaceArchivedError && error.status === 409,
  );
  assert.throws(
    () => assertWorkspaceWritable({ ...member, archivedAt: null, accessMode: "read_only" }),
    (error) => error instanceof WorkspaceReadOnlyError && error.status === 402,
  );
  assert.doesNotThrow(() => assertWorkspaceWritable({ ...member, archivedAt: null, accessMode: "write" }));
});
