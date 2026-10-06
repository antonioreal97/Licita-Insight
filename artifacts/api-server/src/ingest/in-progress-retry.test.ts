import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { inProgressRetry } from "./in-progress-retry";

describe("inProgressRetry", () => {
  it("retries after the stale window plus a margin, once per pending timer", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const run = mock.fn(async (_reason: string) => undefined);
    const retry = inProgressRetry(10 * 60_000, run);

    assert.equal(retry.schedule(), true);
    assert.equal(retry.schedule(), false, "a pending retry is not duplicated");
    t.mock.timers.tick(10 * 60_000);
    assert.equal(run.mock.callCount(), 0);
    t.mock.timers.tick(60_000);
    assert.equal(run.mock.callCount(), 1);
    assert.deepEqual(run.mock.calls[0].arguments, ["in_progress_retry"]);
  });

  it("stops after the retry budget and starts over after a successful start", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const run = mock.fn(async (_reason: string) => undefined);
    const retry = inProgressRetry(1_000, run);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      assert.equal(retry.schedule(), true);
      t.mock.timers.tick(61_000);
    }
    assert.equal(retry.schedule(), false, "budget exhausted");
    assert.equal(run.mock.callCount(), 6);

    retry.reset();
    assert.equal(retry.schedule(), true);
  });

  it("cancels the pending retry on stop", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const run = mock.fn(async (_reason: string) => undefined);
    const retry = inProgressRetry(1_000, run);

    retry.schedule();
    retry.stop();
    t.mock.timers.tick(120_000);
    assert.equal(run.mock.callCount(), 0);
  });
});
