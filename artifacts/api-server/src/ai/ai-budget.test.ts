import assert from "node:assert/strict";
import { test } from "node:test";
import { AiBudgetGuard, type AiDailySpend } from "./ai-budget";

const spend = (total: number): AiDailySpend => ({ ask: total, fit: 0, sheet: 0, title: 0, total });

test("budget guard caches for 30 seconds, warns, pauses and resets on the Sao Paulo day", async () => {
  let now = new Date("2026-09-26T12:00:00-03:00");
  let value = 1;
  let reads = 0;
  const guard = new AiBudgetGuard(async () => { reads += 1; return spend(value); }, () => now,
    () => ({ budgetUsd: 10, warnRatio: 0.8, cacheMs: 30_000 }));
  assert.equal((await guard.read()).level, "ok");
  value = 8;
  now = new Date(now.getTime() + 29_000);
  assert.equal((await guard.read()).level, "ok");
  assert.equal(reads, 1);
  now = new Date(now.getTime() + 2_000);
  assert.equal((await guard.read()).level, "warn");
  value = 10;
  now = new Date(now.getTime() + 31_000);
  assert.equal((await guard.read()).paused, true);
  value = 0;
  now = new Date("2026-09-27T00:01:00-03:00");
  assert.equal((await guard.read()).level, "ok");
});

test("zero budget disables the circuit breaker", async () => {
  const guard = new AiBudgetGuard(async () => spend(999), () => new Date(),
    () => ({ budgetUsd: 0, warnRatio: 0.8, cacheMs: 30_000 }));
  assert.equal((await guard.read()).level, "disabled");
  assert.equal((await guard.read()).paused, false);
});
