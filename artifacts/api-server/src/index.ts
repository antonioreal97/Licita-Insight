import app from "./app";
import { startAiRetentionScheduler } from "./ai/ask-tender-service";
import { startDocumentRetryJob } from "./ai/document-retry-job";
import { startTrialNotificationScheduler } from "./account/trial-notification-scheduler";
import { startEmailNotificationJobs } from "./email/email-scheduler";
import { devEntitlementEnabled } from "./billing/billing-access";
import { abandonStalePncpRuns } from "./ingest/collect-pncp";
import { abandonStaleCultureRuns } from "./ingest/collect-opportunities";
import { startDailyCultureCollect, startDailyPncpCollect } from "./ingest/daily-collect";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (devEntitlementEnabled()) {
  logger.warn(
    { entitlementSource: "dev" },
    "BILLING_DEV_ENTITLED is active; authenticated users bypass the subscription gate",
  );
}

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const start = async (): Promise<void> => {
  try {
    await abandonStalePncpRuns();
    await abandonStaleCultureRuns();
  } catch (error) {
    logger.error({ err: error }, "Failed to reconcile stale PNCP ingest runs");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startTrialNotificationScheduler();
    startEmailNotificationJobs();
    startAiRetentionScheduler();
    startDocumentRetryJob();
    startDailyPncpCollect();
    startDailyCultureCollect();
  });
};

void start();
