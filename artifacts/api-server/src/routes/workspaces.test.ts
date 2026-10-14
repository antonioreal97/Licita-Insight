import assert from "node:assert/strict";
import { test } from "node:test";
import { InvalidParameterError } from "../lib/api-error";
import { workspaceRouteEnabledFor } from "../workspaces/workspace-route-gate";
import {
  parseActiveWorkspace,
  parseWorkspaceCreate,
  parseWorkspacePatch,
} from "./workspaces";

test("workspace payloads accept only the contracted fields", () => {
  const workspaceId = `ws_${"a".repeat(32)}`;
  assert.deepEqual(
    parseWorkspaceCreate({ type: "culture", name: " Cinema " }),
    { type: "culture", name: "Cinema" },
  );
  assert.deepEqual(parseWorkspacePatch({ name: " Editais ", archived: true }), {
    name: "Editais",
    archived: true,
  });
  assert.equal(parseActiveWorkspace({ workspaceId }), workspaceId);
  for (const value of [
    null,
    {},
    { type: "research", name: "Pesquisa" },
    { type: "funding", name: "" },
    { type: "culture", name: "Cultura", ownerUserId: "other" },
  ]) {
    assert.throws(() => parseWorkspaceCreate(value), InvalidParameterError);
  }
  for (const value of [
    null,
    {},
    { archived: "true" },
    { accessMode: "write" },
  ]) {
    assert.throws(() => parseWorkspacePatch(value), InvalidParameterError);
  }
  for (const value of [
    {},
    { workspaceId: "bad" },
    { workspaceId, userId: "other" },
  ]) {
    assert.throws(() => parseActiveWorkspace(value), InvalidParameterError);
  }
});

test("workspace routes require mode, W4 and the journey together", () => {
  const enabled = new Set(["procurement"]);
  assert.equal(
    workspaceRouteEnabledFor("workspaces", true, enabled, "procurement"),
    true,
  );
  assert.equal(
    workspaceRouteEnabledFor("legacy", true, enabled, "procurement"),
    false,
  );
  assert.equal(
    workspaceRouteEnabledFor("workspaces", false, enabled, "procurement"),
    false,
  );
  assert.equal(
    workspaceRouteEnabledFor("workspaces", true, new Set(), "procurement"),
    false,
  );
  assert.equal(
    workspaceRouteEnabledFor("workspaces", true, enabled, "funding"),
    false,
  );
  assert.equal(
    workspaceRouteEnabledFor("workspaces", true, new Set(["study"]), "study"),
    false,
  );
});
