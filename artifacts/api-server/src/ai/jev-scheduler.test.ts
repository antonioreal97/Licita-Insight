import assert from "node:assert/strict";
import test from "node:test";
import { JevQueueTimeoutError, JevScheduler } from "./jev-scheduler";

const config = (overrides: Partial<ConstructorParameters<typeof JevScheduler>[0]> = {}) => ({
  maxConcurrency: 4, batchMaxShare: 0.5, rpmLimit: 10_000,
  interactiveReserveRpm: 0, backoffMs: 25, interactiveQueueTimeoutMs: 30,
  metricsIntervalMs: 60_000, ...overrides,
});

test("batch stays within its share and interactive work takes free priority", async () => {
  const scheduler = new JevScheduler(config());
  let batchPeak = 0;
  let interactiveStarted = false;
  const releases: Array<() => void> = [];
  const blocked = () => new Promise<void>((resolve) => releases.push(resolve));
  const batches = Array.from({ length: 8 }, () => scheduler.schedule("batch", async () => {
    batchPeak = Math.max(batchPeak, scheduler.snapshot().inFlight.batch);
    await blocked();
  }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scheduler.snapshot().inFlight.batch, 2);
  const interactive = scheduler.schedule("interactive", async () => { interactiveStarted = true; });
  await interactive;
  assert.equal(interactiveStarted, true);
  assert.equal(batchPeak, 2);
  while (releases.length > 0) releases.shift()?.();
  while (scheduler.snapshot().queued.batch > 0 || scheduler.snapshot().inFlight.batch > 0) {
    await new Promise((resolve) => setImmediate(resolve));
    while (releases.length > 0) releases.shift()?.();
  }
  await Promise.all(batches);
  scheduler.dispose();
});

test("batch pause does not pause interactive work", async () => {
  const scheduler = new JevScheduler(config({ backoffMs: 40 }));
  scheduler.recordRateLimit("batch", 40);
  let batchRan = false;
  const batch = scheduler.schedule("batch", async () => { batchRan = true; });
  const interactive = scheduler.schedule("interactive", async () => "ok");
  assert.equal(await interactive, "ok");
  assert.equal(batchRan, false);
  await batch;
  assert.equal(batchRan, true);
  scheduler.dispose();
});

test("daily budget pause blocks batch while interactive keeps running", async () => {
  const scheduler = new JevScheduler(config());
  scheduler.setBatchBudgetPaused(true);
  let batchRan = false;
  const batch = scheduler.schedule("batch", async () => { batchRan = true; return "batch"; });
  assert.equal(await scheduler.schedule("interactive", async () => "interactive"), "interactive");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(batchRan, false);
  scheduler.setBatchBudgetPaused(false);
  assert.equal(await batch, "batch");
  scheduler.dispose();
});

test("interactive queue times out instead of hanging", async () => {
  const scheduler = new JevScheduler(config({ maxConcurrency: 1, interactiveQueueTimeoutMs: 15 }));
  let release!: () => void;
  const first = scheduler.schedule("interactive", () => new Promise<void>((resolve) => { release = resolve; }));
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(scheduler.schedule("interactive", async () => undefined), JevQueueTimeoutError);
  release();
  await first;
  scheduler.dispose();
});

test("real concurrent mix respects 50% batch and global ceilings", async () => {
  const scheduler = new JevScheduler(config({ maxConcurrency: 10, batchMaxShare: 0.5 }));
  let batchPeak = 0;
  let totalPeak = 0;
  const operation = (lane: "interactive" | "batch") => scheduler.schedule(lane, async () => {
    const state = scheduler.snapshot().inFlight;
    batchPeak = Math.max(batchPeak, state.batch);
    totalPeak = Math.max(totalPeak, state.batch + state.interactive);
    await new Promise((resolve) => setTimeout(resolve, 2));
  });
  await Promise.all([
    ...Array.from({ length: 50 }, () => operation("batch")),
    ...Array.from({ length: 50 }, () => operation("interactive")),
  ]);
  assert.ok(batchPeak <= 5, `batch peak ${batchPeak}`);
  assert.ok(totalPeak <= 10, `total peak ${totalPeak}`);
  assert.equal(scheduler.snapshot().queued.batch, 0);
  assert.equal(scheduler.snapshot().queued.interactive, 0);
  scheduler.dispose();
});
