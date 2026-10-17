import { createCompanyDocumentExpiryNotifications, evaluateSavedSearchNotifications } from "../account/notification-service";
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
import { resolveNotificationJobSchedule } from "./email-scheduler-plan";

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
      logger.warn(
        { operation },
        "Notification job skipped because the previous run is active",
      );
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
  const schedule = resolveNotificationJobSchedule();
  if (!schedule.databaseAvailable) {
    logger.error("DATABASE_URL is not set; notification jobs will not start");
    return () => undefined;
  }
  if (!schedule.emailDeliveryEnabled) {
    logger.info(
      "Email delivery jobs are disabled; in-app notification jobs remain enabled",
    );
  }

  const digestHour = integerEnv("EMAIL_DIGEST_HOUR", 7, 0, 23);
  const immediateWindowMinutes = schedule.immediateEmail
    ? integerEnv("EMAIL_IMMEDIATE_WINDOW_MINUTES", 10, 1, 60)
    : 10;
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
  const runProfileAlerts = async (operation: string, startedAt: number) => {
    await evaluateProfileAlertNotifications();
    logger.info(
      { operation, durationMs: Date.now() - startedAt },
      "Profile alert notification job completed",
    );
  };
  const runSavedSearches = protectedJob("saved_search_evaluation", async () => {
    const startedAt = Date.now();
    await runSavedSearchEvaluationJob();
    logger.info(
      {
        operation: "saved_search_evaluation",
        durationMs: Date.now() - startedAt,
      },
      "Saved search notification job completed",
    );
  });
  const runDaily = protectedJob(
    schedule.emailDigest ? "email_digest" : "profile_alert_evaluation",
    async () => {
      const startedAt = Date.now();
      await runProfileAlerts(
        schedule.emailDigest ? "email_digest" : "profile_alert_evaluation",
        startedAt,
      );
      await createCompanyDocumentExpiryNotifications();
      if (!schedule.emailDigest) return;
      const result = await runDailyEmailDigest();
      logEmailJobResult("email_digest", result, startedAt);
    },
  );

  const timers: NodeJS.Timeout[] = [];
  if (schedule.immediateEmail) {
    const immediateTimer = setInterval(() => void runImmediate(), 60_000);
    immediateTimer.unref();
    timers.push(immediateTimer);
  }
  const savedSearchTimer = setInterval(
    () => void runSavedSearches(),
    savedSearchIntervalMinutes * 60_000,
  );
  savedSearchTimer.unref();
  timers.push(savedSearchTimer);

  let digestTimer: NodeJS.Timeout | undefined;
  let stopped = false;
  const armDigest = () => {
    if (stopped) return;
    const delay = millisecondsUntilSaoPauloHour(digestHour);
    logger.info(
      { hour: digestHour, timeZone: TIME_ZONE, delayMs: delay },
      schedule.emailDigest
        ? "Next email digest scheduled"
        : "Next profile alert evaluation scheduled",
    );
    digestTimer = setTimeout(() => {
      void runDaily().finally(armDigest);
    }, delay);
    digestTimer.unref();
  };

  if (schedule.immediateEmail) void runImmediate();
  void runSavedSearches();
  armDigest();
  return () => {
    stopped = true;
    for (const timer of timers) clearInterval(timer);
    if (digestTimer) clearTimeout(digestTimer);
  };
}
