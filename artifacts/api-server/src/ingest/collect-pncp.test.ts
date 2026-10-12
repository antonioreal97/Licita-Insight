import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PncpError } from "./pncp-client";
import {
  classifyPncpRefreshFailure,
  refreshPncpCandidates,
} from "./pncp-refresh-failure";

describe("PNCP refresh failure classification", () => {
  it("treats HTTP 410 as a source removal instead of a refresh error", () => {
    assert.equal(
      classifyPncpRefreshFailure(new PncpError("removed", 410, "")),
      "source_removed",
    );
  });

  it("keeps HTTP 404 as a refresh error so the tender is tried again", () => {
    assert.equal(
      classifyPncpRefreshFailure(new PncpError("not found", 404, "")),
      "error",
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

const timeout = () => {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
};

describe("PNCP refresh circuit breaker", () => {
  it("stops after three consecutive timeouts and reports exact counters once", async () => {
    let attempts = 0;
    const circuitLogs: Array<{
      counters: unknown;
      consecutiveRecoverableFailures: number;
    }> = [];

    const result = await refreshPncpCandidates([1, 2, 3, 4, 5], {
      maxConsecutiveRecoverableFailures: 3,
      attempt: async () => {
        attempts += 1;
        throw timeout();
      },
      onCircuitOpen: (counters, consecutiveRecoverableFailures) => {
        circuitLogs.push({ counters, consecutiveRecoverableFailures });
      },
    });

    assert.equal(attempts, 3);
    assert.deepEqual(result, {
      updated: 0,
      failed: 3,
      unattempted: 2,
      stoppedAfterConsecutiveRecoverableFailures: true,
    });
    assert.deepEqual(circuitLogs, [
      { counters: result, consecutiveRecoverableFailures: 3 },
    ]);
  });

  it("resets the consecutive count after a successful refresh", async () => {
    const outcomes = [timeout(), "updated", timeout()] as const;
    let attempts = 0;
    let circuitLogs = 0;

    const result = await refreshPncpCandidates([...outcomes], {
      maxConsecutiveRecoverableFailures: 2,
      attempt: async (outcome) => {
        attempts += 1;
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
      onCircuitOpen: () => {
        circuitLogs += 1;
      },
    });

    assert.equal(attempts, 3);
    assert.deepEqual(result, {
      updated: 1,
      failed: 2,
      unattempted: 0,
      stoppedAfterConsecutiveRecoverableFailures: false,
    });
    assert.equal(circuitLogs, 0);
  });

  it("does not count 404, removed resources, or a missing purchase toward the threshold", async () => {
    const outcomes = [
      timeout(),
      new PncpError("not found", 404, ""),
      timeout(),
      new PncpError("removed", 410, ""),
      timeout(),
      "failed",
      timeout(),
    ] as const;
    const removedStatuses: number[] = [];

    const result = await refreshPncpCandidates([...outcomes], {
      maxConsecutiveRecoverableFailures: 2,
      attempt: async (outcome) => {
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
      onSourceRemoved: (error) => {
        removedStatuses.push((error as PncpError).status);
      },
    });

    assert.deepEqual(removedStatuses, [410]);
    assert.deepEqual(result, {
      updated: 0,
      failed: 6,
      unattempted: 0,
      stoppedAfterConsecutiveRecoverableFailures: false,
    });
  });
});
