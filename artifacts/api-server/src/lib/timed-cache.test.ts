import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTimedCache } from "./timed-cache";

const MINUTE = 60_000;

describe("createTimedCache", () => {
  it("serves the loaded value until the TTL passes, then loads again", async () => {
    let clock = 0;
    let loads = 0;
    const cache = createTimedCache(async () => ++loads, { ttlMs: 15 * MINUTE, retryMs: MINUTE, now: () => clock });

    assert.equal(await cache.get(), 1);
    clock = 15 * MINUTE - 1;
    assert.equal(await cache.get(), 1);
    clock = 15 * MINUTE;
    assert.equal(await cache.get(), 2);
    assert.equal(loads, 2);
  });

  it("shares one load between callers that arrive together", async () => {
    let loads = 0;
    let release!: (value: string) => void;
    const cache = createTimedCache(
      () => {
        loads += 1;
        return new Promise<string>((resolve) => (release = resolve));
      },
      { ttlMs: MINUTE, retryMs: MINUTE },
    );

    const callers = [cache.get(), cache.get(), cache.get()];
    release("ready");
    assert.deepEqual(await Promise.all(callers), ["ready", "ready", "ready"]);
    assert.equal(loads, 1);
  });

  it("keeps the previous value when a reload fails and waits before trying again", async () => {
    let clock = 0;
    let loads = 0;
    let failing = false;
    const cache = createTimedCache(
      async () => {
        loads += 1;
        if (failing) throw new Error("database is down");
        return `value ${loads}`;
      },
      { ttlMs: 15 * MINUTE, retryMs: MINUTE, now: () => clock },
    );

    assert.equal(await cache.get(), "value 1");
    failing = true;
    clock = 15 * MINUTE;
    assert.equal(await cache.get(), "value 1");
    assert.equal(loads, 2);
    // Inside the retry window the source is left alone.
    clock += MINUTE - 1;
    assert.equal(await cache.get(), "value 1");
    assert.equal(loads, 2);
    failing = false;
    clock += 1;
    assert.equal(await cache.get(), "value 3");
  });

  it("rejects when the first load fails and retries on the next call", async () => {
    let loads = 0;
    const cache = createTimedCache(
      async () => {
        loads += 1;
        if (loads === 1) throw new Error("database is down");
        return "ready";
      },
      { ttlMs: MINUTE, retryMs: MINUTE },
    );

    await assert.rejects(cache.get(), /database is down/);
    assert.equal(await cache.get(), "ready");
  });
});
