import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createKeyedTimedCache, createTimedCache } from "./timed-cache";

const MINUTE = 60_000;

describe("createTimedCache", () => {
  it("serves the loaded value until the TTL passes, then loads again", async () => {
    let clock = 0;
    let loads = 0;
    const cache = createTimedCache(async () => ++loads, {
      ttlMs: 15 * MINUTE,
      retryMs: MINUTE,
      now: () => clock,
    });

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

  it("does not let a load that was cleared repopulate the cache", async () => {
    let release!: (value: string) => void;
    let loads = 0;
    const cache = createTimedCache(
      () => {
        loads += 1;
        if (loads === 1)
          return new Promise<string>((resolve) => (release = resolve));
        return Promise.resolve("new");
      },
      { ttlMs: MINUTE, retryMs: MINUTE },
    );

    const old = cache.get();
    cache.clear();
    assert.equal(await cache.get(), "new");
    release("old");
    assert.equal(await old, "old");
    assert.equal(await cache.get(), "new");
  });

  it("serves stale while one caller refreshes inside the configured window", async () => {
    let clock = 0;
    let loads = 0;
    let release!: (value: number) => void;
    const cache = createTimedCache(
      () => {
        loads += 1;
        if (loads === 1) return Promise.resolve(1);
        return new Promise<number>((resolve) => (release = resolve));
      },
      {
        ttlMs: MINUTE,
        retryMs: 1,
        staleWhileRevalidateMs: 30_000,
        now: () => clock,
      },
    );

    assert.equal(await cache.get(), 1);
    clock = MINUTE;
    assert.equal(await cache.get(), 1);
    assert.equal(await cache.get(), 1);
    assert.equal(loads, 2);
    release(2);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(await cache.get(), 2);
  });
});

describe("createKeyedTimedCache", () => {
  it("shares loads per key and clears one or every key", async () => {
    const cache = createKeyedTimedCache<string, number>({
      ttlMs: MINUTE,
      retryMs: MINUTE,
      maxEntries: 3,
    });
    let loads = 0;
    const load = async () => ++loads;

    assert.deepEqual(
      await Promise.all([cache.get("a", load), cache.get("a", load)]),
      [1, 1],
    );
    assert.equal(await cache.get("b", load), 2);
    cache.clear("a");
    assert.equal(await cache.get("a", load), 3);
    cache.clear();
    assert.equal(cache.size(), 0);
    assert.equal(await cache.get("b", load), 4);
  });

  it("evicts the least recently used key at the configured bound", async () => {
    const cache = createKeyedTimedCache<string, string>({
      ttlMs: MINUTE,
      retryMs: MINUTE,
      maxEntries: 2,
    });
    let loads = 0;
    const get = (key: string) =>
      cache.get(key, async () => `${key}-${++loads}`);

    assert.equal(await get("a"), "a-1");
    assert.equal(await get("b"), "b-2");
    assert.equal(await get("a"), "a-1");
    assert.equal(await get("c"), "c-3");
    assert.equal(await get("b"), "b-4");
  });

  it("can reject an expired load instead of serving stale data", async () => {
    let clock = 0;
    let fail = false;
    const cache = createKeyedTimedCache<string, string>({
      ttlMs: MINUTE,
      retryMs: 1,
      maxEntries: 2,
      now: () => clock,
      staleOnError: false,
    });
    const load = async () => {
      if (fail) throw new Error("reload failed");
      return "fresh";
    };

    assert.equal(await cache.get("a", load), "fresh");
    fail = true;
    clock = MINUTE;
    await assert.rejects(cache.get("a", load), /reload failed/);
  });
});
