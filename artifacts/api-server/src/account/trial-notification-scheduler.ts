import { logger } from "../lib/logger";
import { createTrialEndingNotifications } from "./notification-service";
import { tryRunSingletonJob } from "../jobs/job-lock";

const INTERVAL_MS = 6 * 60 * 60 * 1000;

export function startTrialNotificationScheduler(): () => void {
  if (!process.env.DATABASE_URL) {
    logger.error("DATABASE_URL is not set; trial notification scheduler will not start");
    return () => undefined;
  }

  const run = async () => {
    const startedAt = Date.now();
    try {
      const result = await tryRunSingletonJob("trial_notifications", () => createTrialEndingNotifications());
      if (!result.acquired) return;
      const created = result.value;
      logger.info(
        { created, durationMs: Date.now() - startedAt },
        "Trial ending notifications evaluated",
      );
    } catch (error) {
      logger.error(
        { err: error, durationMs: Date.now() - startedAt },
        "Trial ending notification evaluation failed",
      );
    }
  };

  void run();
  const timer = setInterval(() => void run(), INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
