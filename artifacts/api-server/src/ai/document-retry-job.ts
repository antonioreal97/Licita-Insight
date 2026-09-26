import { logger } from "../lib/logger";
import { runDocumentRetryBatch } from "./tender-index-service";
import { tryRunSingletonJob } from "../jobs/job-lock";

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
    const locked = await tryRunSingletonJob("document_retry", () => runDocumentRetryBatch(now));
    if (!locked.acquired) return;
    const result = locked.value;
    if (result.attempted > 0) {
      logger.info(result, "Document retry job completed");
    }
  } catch (error) {
    logger.error({ err: error }, "Document retry job failed");
  } finally {
    running = false;
  }
}

export function startDocumentRetryJob(): () => void {
  if (!process.env.DATABASE_URL) {
    logger.error("DATABASE_URL is not set; document retry job will not start");
    return () => undefined;
  }
  void runDocumentRetryJob();
  const timer = setInterval(() => void runDocumentRetryJob(), JOB_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
