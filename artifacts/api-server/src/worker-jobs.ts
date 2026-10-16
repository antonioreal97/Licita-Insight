export type WorkerJobs = "all" | "light" | "heavy";

export const workerJobsFromEnv = (
  raw = process.env.WORKER_JOBS,
): WorkerJobs => {
  const group = raw?.trim() || "all";
  if (group === "all" || group === "light" || group === "heavy") return group;
  throw new Error(
    `WORKER_JOBS must be one of all, light or heavy; received "${group}"`,
  );
};

// Keep the original startup order; all is the backwards-compatible default.
export const schedulerGroups = {
  startAiJobWorker: "heavy",
  startAiDocumentRetentionScheduler: "light",
  startTrialNotificationScheduler: "light",
  startEmailNotificationJobs: "light",
  startAiRetentionScheduler: "light",
  startDocumentRetryJob: "heavy",
  startDailyPncpCollect: "heavy",
  startDailyTransparencyCollect: "heavy",
  startTenderDeadlineReconciliation: "light",
  startPlatformBackfillScheduler: "heavy",
  startEstimatedValueReviewScheduler: "heavy",
  startOpportunityOwnerReviewScheduler: "heavy",
  startDailyCultureCollect: "heavy",
  startDailyFundingCollect: "heavy",
  startDailyCultureFederalCollect: "heavy",
  startDailyInternationalCollect: "heavy",
  startDailyCategoryClassify: "heavy",
  startNightlyCategoryClassification: "heavy",
  startRecommendationScheduler: "light",
  startProfileKeywordScheduler: "heavy",
  startPersonalDataRetentionScheduler: "light",
  startBillingReconciliationScheduler: "light",
} as const;

export const workerRunsHeavyJobs = (group: WorkerJobs): boolean =>
  group !== "light";

type SchedulerStarters = Record<keyof typeof schedulerGroups, () => () => void>;

export const startWorkerSchedulers = (
  group: WorkerJobs,
  starters: SchedulerStarters,
): Array<() => void> =>
  (Object.keys(schedulerGroups) as Array<keyof typeof schedulerGroups>)
    .filter((name) => group === "all" || schedulerGroups[name] === group)
    .map((name) => starters[name]());
