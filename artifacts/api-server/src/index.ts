import app from "./app";
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
    startDailyPncpCollect();
    startDailyCultureCollect();
  });
};

void start();
