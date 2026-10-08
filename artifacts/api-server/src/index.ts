import type { Server } from "node:http";
import app from "./app";
import { appRoleFromEnv, roleRunsJobs, roleServesApi } from "./app-role";
import { startAiRetentionScheduler } from "./ai/ask-tender-service";
import { startDocumentRetryJob } from "./ai/document-retry-job";
import { startTrialNotificationScheduler } from "./account/trial-notification-scheduler";
import { startEmailNotificationJobs } from "./email/email-scheduler";
import { devEntitlementEnabled } from "./billing/billing-access";
import { abandonStalePncpRuns } from "./ingest/collect-pncp";
import { abandonStaleCultureRuns } from "./ingest/collect-opportunities";
import { abandonStaleFundingRuns } from "./ingest/collect-funding";
import { abandonStaleTransparencyRuns } from "./ingest/collect-transparency";
import {
  startDailyCategoryClassify,
  startDailyCultureCollect,
  startDailyFundingCollect,
  startDailyPncpCollect,
  startDailyTransparencyCollect,
} from "./ingest/daily-collect";
import { startTenderDeadlineReconciliation } from "./ingest/reconcile-tender-deadlines";
import { startPlatformBackfillScheduler } from "./ingest/platform-backfill";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import {
  configureHttpServer,
  httpServerConfig,
  installGracefulShutdown,
} from "./server-runtime";
import { createWorkerHealthApp } from "./worker-health";
import { tryRunSingletonJob } from "./jobs/job-lock";
import { startAiJobWorker } from "./ai/ai-job-queue";
import { startAiDocumentRetentionScheduler } from "./ai/ai-document-retention";
import { startMetricsServer } from "./metrics";
import { startRecommendationScheduler } from "./recommendations/recommendation-service";
import { startProfileKeywordScheduler } from "./profile/keyword-vocabulary";
import { startPersonalDataRetentionScheduler } from "./account/personal-data-retention";

const parsePort = (
  name: "PORT" | "WORKER_HEALTH_PORT" | "METRICS_PORT",
  required: boolean,
): number | undefined => {
  const raw = process.env[name]?.trim();
  if (!raw) {
    if (required)
      throw new Error(
        `${name} environment variable is required but was not provided.`,
      );
    return undefined;
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid ${name} value: "${raw}"`);
  }
  return port;
};

const startHttpServer = (port: number, healthOnly: boolean): Server => {
  const server = (healthOnly ? createWorkerHealthApp() : app).listen(
    port,
    () => {
      logger.info(
        { port, healthOnly },
        healthOnly ? "Worker health server listening" : "Server listening",
      );
    },
  );
  configureHttpServer(server, httpServerConfig());
  server.once("error", (error) => {
    logger.error({ err: error, port }, "Error listening on port");
    process.exit(1);
  });
  return server;
};

const startSchedulers = (): Array<() => void> => [
  startAiJobWorker(),
  startAiDocumentRetentionScheduler(),
  startTrialNotificationScheduler(),
  startEmailNotificationJobs(),
  startAiRetentionScheduler(),
  startDocumentRetryJob(),
  startDailyPncpCollect(),
  startDailyTransparencyCollect(),
  startTenderDeadlineReconciliation(),
  startPlatformBackfillScheduler(),
  startDailyCultureCollect(),
  startDailyFundingCollect(),
  startDailyCategoryClassify(),
  startRecommendationScheduler(),
  startProfileKeywordScheduler(),
  startPersonalDataRetentionScheduler(),
];

const start = async (): Promise<void> => {
  const role = appRoleFromEnv();
  const servesApi = roleServesApi(role);
  const runsJobs = roleRunsJobs(role);
  const apiPort = servesApi ? parsePort("PORT", true) : undefined;
  const workerHealthPort =
    role === "worker" ? parsePort("WORKER_HEALTH_PORT", false) : undefined;
  const metricsPort = parsePort("METRICS_PORT", false);

  if (devEntitlementEnabled()) {
    logger.warn(
      { entitlementSource: "dev" },
      "BILLING_DEV_ENTITLED is active; authenticated users bypass the subscription gate",
    );
  }

  if (runsJobs) {
    try {
      await tryRunSingletonJob("ingest_reconciliation", async () => {
        await abandonStalePncpRuns();
        await abandonStaleCultureRuns();
        await abandonStaleFundingRuns();
        await abandonStaleTransparencyRuns();
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to reconcile stale ingest runs");
    }
  }

  const server = apiPort
    ? startHttpServer(apiPort, false)
    : workerHealthPort
      ? startHttpServer(workerHealthPort, true)
      : undefined;
  const metricsServer = metricsPort
    ? startMetricsServer(metricsPort)
    : undefined;
  const stops = runsJobs ? startSchedulers() : [];
  const config = httpServerConfig();
  installGracefulShutdown({
    server,
    stopSchedulers: () => {
      stops.forEach((stop) => stop());
      metricsServer?.close();
    },
    closePool: () => pool.end(),
    timeoutMs: config.shutdownTimeoutMs,
  });
  logger.info(
    { role, apiPort, workerHealthPort, metricsPort, schedulers: runsJobs },
    "Application role started",
  );
};

void start().catch((error) => {
  logger.error({ err: error }, "Application failed to start");
  process.exit(1);
});
