import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PncpError } from "./pncp-client";
import { classifyPncpRefreshFailure } from "./pncp-refresh-failure";

describe("PNCP refresh failure classification", () => {
  it("treats HTTP 410 as a source removal instead of a refresh error", () => {
    assert.equal(
      classifyPncpRefreshFailure(new PncpError("removed", 410, "")),
      "source_removed",
    );
  });

  it("keeps other PNCP failures and runtime errors as refresh errors", () => {
    assert.equal(
      classifyPncpRefreshFailure(new PncpError("server error", 500, "")),
      "error",
    );
    assert.equal(classifyPncpRefreshFailure(new Error("timeout")), "error");
  });
});
