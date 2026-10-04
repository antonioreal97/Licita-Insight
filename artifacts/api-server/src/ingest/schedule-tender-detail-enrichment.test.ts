import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { TenderDetailEnrichmentQueue } from "./tender-detail-enrichment-queue";

test("detail enrichment deduplicates requests and limits concurrent PNCP work", async () => {
  const started: string[] = [];
  const finish = new Map<string, () => void>();
  const queue = new TenderDetailEnrichmentQueue((id) => new Promise<void>((resolve) => {
    started.push(id);
    finish.set(id, resolve);
  }), { concurrency: 1, maxQueued: 1 });

  queue.schedule("a");
  queue.schedule("a");
  queue.schedule("b");
  queue.schedule("c"); // Queue is full; polling can schedule this again later.
  await setImmediate();
  assert.deepEqual(started, ["a"]);
  finish.get("a")!();
  await setImmediate();
  assert.deepEqual(started, ["a", "b"]);
  finish.get("b")!();
  await setImmediate();
  queue.schedule("c");
  await setImmediate();
  assert.deepEqual(started, ["a", "b", "c"]);
  finish.get("c")!();
});

test("failed PNCP enrichment waits for the retry cooldown", async () => {
  let now = 1_000;
  let attempts = 0;
  const errors: unknown[] = [];
  const queue = new TenderDetailEnrichmentQueue(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("PNCP 503");
  }, { now: () => now, retryAfterMs: 60_000, onError: (_id, error) => errors.push(error) });

  queue.schedule("a");
  await setImmediate();
  assert.equal(attempts, 1);
  assert.equal(errors.length, 1);
  queue.schedule("a");
  await setImmediate();
  assert.equal(attempts, 1);
  now += 60_000;
  queue.schedule("a");
  await setImmediate();
  assert.equal(attempts, 2);
});
