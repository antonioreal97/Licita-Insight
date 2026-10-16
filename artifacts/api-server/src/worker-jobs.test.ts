import assert from "node:assert/strict";
import test from "node:test";
import {
  schedulerGroups,
  startWorkerSchedulers,
  workerJobsFromEnv,
  workerRunsHeavyJobs,
} from "./worker-jobs";

test("WORKER_JOBS defaults to all and rejects unknown groups", () => {
  assert.equal(workerJobsFromEnv(undefined), "all");
  assert.equal(workerJobsFromEnv("  "), "all");
  assert.equal(workerJobsFromEnv("light"), "light");
  assert.equal(workerJobsFromEnv("heavy"), "heavy");
  assert.throws(
    () => workerJobsFromEnv("collectors"),
    /WORKER_JOBS must be one of/,
  );
});

test("all preserves the complete scheduler set and startup order", () => {
  const calls: string[] = [];
  const starters = Object.fromEntries(
    Object.keys(schedulerGroups).map((name) => [
      name,
      () => {
        calls.push(name);
        return () => undefined;
      },
    ]),
  ) as Parameters<typeof startWorkerSchedulers>[1];

  const stops = startWorkerSchedulers("all", starters);

  assert.deepEqual(calls, Object.keys(schedulerGroups));
  assert.equal(stops.length, Object.keys(schedulerGroups).length);
});

test("light and heavy are disjoint and cover every scheduler", () => {
  const calls: string[] = [];
  const starters = Object.fromEntries(
    Object.keys(schedulerGroups).map((name) => [
      name,
      () => {
        calls.push(name);
        return () => undefined;
      },
    ]),
  ) as Parameters<typeof startWorkerSchedulers>[1];

  startWorkerSchedulers("light", starters);
  const light = [...calls];
  calls.length = 0;
  startWorkerSchedulers("heavy", starters);
  const heavy = [...calls];

  assert.equal(
    light.length + heavy.length,
    Object.keys(schedulerGroups).length,
  );
  assert.deepEqual(
    light.filter((name) => heavy.includes(name)),
    [],
  );
  assert.deepEqual(light, [
    "startAiDocumentRetentionScheduler",
    "startTrialNotificationScheduler",
    "startEmailNotificationJobs",
    "startAiRetentionScheduler",
    "startTenderDeadlineReconciliation",
    "startRecommendationScheduler",
    "startPersonalDataRetentionScheduler",
    "startBillingReconciliationScheduler",
  ]);
  assert.equal(workerRunsHeavyJobs("light"), false);
  assert.equal(workerRunsHeavyJobs("heavy"), true);
  assert.equal(workerRunsHeavyJobs("all"), true);
});
