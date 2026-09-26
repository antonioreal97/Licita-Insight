import { evaluateSavedSearchNotifications } from "../account/notification-service";
import { evaluateProfileAlertNotifications } from "../ai/company-fit-service";
import { logger } from "../lib/logger";
import { tryRunSingletonJob } from "../jobs/job-lock";
import { millisecondsUntilSaoPauloHour } from "../lib/sao-paulo-schedule";
import {
  logEmailJobResult,
  retryEmailDeliveries,
  runDailyEmailDigest,
  runImmediateEmailAlerts,
} from "./email-service";

const TIME_ZONE = "America/Sao_Paulo";

const integerEnv = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
};

const protectedJob = (operation: string, job: () => Promise<void>) => {
  let running = false;
  return async () => {
    if (running) {
      logger.warn({ operation }, "Notification job skipped because the previous run is active");
      return;
    }
    running = true;
    try {
      await tryRunSingletonJob(operation, job);
    } catch (error) {
      logger.error({ err: error, operation }, "Notification job failed");
    } finally {
      running = false;
    }
  };
};

export const runSavedSearchEvaluationJob = async (
  now = new Date(),
): Promise<void> => evaluateSavedSearchNotifications(now);

export function startEmailNotificationJobs(): () => void {
  if (process.env.EMAIL_JOBS_ENABLED === "false") {
    logger.info("Email notification jobs are disabled");
    return () => undefined;
  }
  if (!process.env.DATABASE_URL) {
    logger.error("DATABASE_URL is not set; email notification jobs will not start");
    return () => undefined;
  }

  const digestHour = integerEnv("EMAIL_DIGEST_HOUR", 7, 0, 23);
  const immediateWindowMinutes = integerEnv(
    "EMAIL_IMMEDIATE_WINDOW_MINUTES",
    10,
    1,
    60,
  );
  const savedSearchIntervalMinutes = integerEnv(
    "SAVED_SEARCH_JOB_INTERVAL_MINUTES",
    15,
    1,
    1_440,
  );

  const runImmediate = protectedJob("email_immediate", async () => {
    const startedAt = Date.now();
    const result = await runImmediateEmailAlerts(new Date(), {
      windowMinutes: immediateWindowMinutes,
    });
    const retries = await retryEmailDeliveries();
    logEmailJobResult(
      "email_immediate",
      {
        queued: result.queued + retries.queued,
        sent: result.sent + retries.sent,
        failed: result.failed + retries.failed,
        skipped: result.skipped + retries.skipped,
      },
      startedAt,
    );
  });
  const runSavedSearches = protectedJob("saved_search_evaluation", async () => {
    const startedAt = Date.now();
    await runSavedSearchEvaluationJob();
    logger.info(
      { operation: "saved_search_evaluation", durationMs: Date.now() - startedAt },
      "Saved search notification job completed",
    );
  });
  const runDigest = protectedJob("email_digest", async () => {
    const startedAt = Date.now();
    await evaluateProfileAlertNotifications();
    const result = await runDailyEmailDigest();
    logEmailJobResult("email_digest", result, startedAt);
  });

  const immediateTimer = setInterval(() => void runImmediate(), 60_000);
  immediateTimer.unref();
  const savedSearchTimer = setInterval(
    () => void runSavedSearches(),
    savedSearchIntervalMinutes * 60_000,
  );
  savedSearchTimer.unref();

  let digestTimer: NodeJS.Timeout | undefined;
  let stopped = false;
  const armDigest = () => {
    if (stopped) return;
    const delay = millisecondsUntilSaoPauloHour(digestHour);
    logger.info(
      { hour: digestHour, timeZone: TIME_ZONE, delayMs: delay },
      "Next email digest scheduled",
    );
    digestTimer = setTimeout(() => {
      void runDigest().finally(armDigest);
    }, delay);
    digestTimer.unref();
  };

  void runImmediate();
  void runSavedSearches();
  armDigest();
  return () => {
    stopped = true;
    clearInterval(immediateTimer);
    clearInterval(savedSearchTimer);
    if (digestTimer) clearTimeout(digestTimer);
  };
}
