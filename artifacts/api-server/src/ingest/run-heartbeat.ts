import { and, eq } from "drizzle-orm";
import { db, ingestRunsTable } from "@workspace/db";
import { logger } from "../lib/logger";

export const INGEST_HEARTBEAT_INTERVAL_MS = 30_000;
export const INTERRUPTED_RUN_OBSERVATION_MS = 3 * INGEST_HEARTBEAT_INTERVAL_MS;

/** Keeps long network phases distinguishable from a process that was restarted. */
export const startIngestRunHeartbeat = (
  runId: string,
  intervalMs = INGEST_HEARTBEAT_INTERVAL_MS,
): (() => void) => {
  let touching = false;
  const timer = setInterval(() => {
    if (touching) return;
    touching = true;
    void db
      .update(ingestRunsTable)
      .set({ heartbeatAt: new Date() })
      .where(
        and(
          eq(ingestRunsTable.id, runId),
          eq(ingestRunsTable.status, "running"),
        ),
      )
      .catch((error: unknown) =>
        logger.warn(
          { err: error, runId },
          "Could not update ingest run heartbeat",
        ),
      )
      .finally(() => {
        touching = false;
      });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
};
