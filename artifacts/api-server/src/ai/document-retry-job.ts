import { logger } from "../lib/logger";
import { runDocumentRetryBatch } from "./tender-index-service";

const JOB_INTERVAL_MS = 60_000;
let running = false;

export async function runDocumentRetryJob(now = new Date()): Promise<void> {
  if (running) {
    logger.warn(
      "Document retry job skipped because the previous run is active",
    );
    return;
  }
  running = true;
  try {
    const result = await runDocumentRetryBatch(now);
    if (result.attempted > 0) {
      logger.info(result, "Document retry job completed");
    }
  } catch (error) {
    logger.error({ err: error }, "Document retry job failed");
  } finally {
    running = false;
  }
}

export function startDocumentRetryJob(): void {
  if (!process.env.DATABASE_URL) {
    logger.error("DATABASE_URL is not set; document retry job will not start");
    return;
  }
  void runDocumentRetryJob();
  setInterval(() => void runDocumentRetryJob(), JOB_INTERVAL_MS).unref();
}
