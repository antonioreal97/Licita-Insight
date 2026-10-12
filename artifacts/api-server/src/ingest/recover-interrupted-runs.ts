import { and, eq, inArray, or } from "drizzle-orm";
import { db, ingestRunsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { INTERRUPTED_BY_RESTART_ERROR } from "./international-collect-decision";
import { INTERRUPTED_RUN_OBSERVATION_MS } from "./run-heartbeat";

export const IN_MEMORY_INGEST_SOURCES = [
  "pncp",
  "pncp-transparency",
  "mapas-culturais",
  "funding-opportunities",
  "culture-federal",
  "international",
] as const;

export type RecoverableIngestRun = {
  id: string;
  source: string;
  heartbeatAt: Date;
};

type RecoveryDeps = {
  loadRunning: (ids?: string[]) => Promise<RecoverableIngestRun[]>;
  failInterrupted: (
    runs: RecoverableIngestRun[],
    finishedAt: Date,
  ) => Promise<number>;
  wait: (milliseconds: number) => Promise<void>;
  now: () => Date;
};

const loadRunning = async (ids?: string[]): Promise<RecoverableIngestRun[]> =>
  db
    .select({
      id: ingestRunsTable.id,
      source: ingestRunsTable.source,
      heartbeatAt: ingestRunsTable.heartbeatAt,
    })
    .from(ingestRunsTable)
    .where(
      and(
        eq(ingestRunsTable.status, "running"),
        inArray(ingestRunsTable.source, [...IN_MEMORY_INGEST_SOURCES]),
        ...(ids ? [inArray(ingestRunsTable.id, ids)] : []),
      ),
    );

const failInterrupted = async (
  runs: RecoverableIngestRun[],
  finishedAt: Date,
): Promise<number> => {
  if (runs.length === 0) return 0;
  const rows = await db
    .update(ingestRunsTable)
    .set({
      status: "failed",
      error: INTERRUPTED_BY_RESTART_ERROR,
      finishedAt,
      heartbeatAt: finishedAt,
    })
    .where(
      and(
        eq(ingestRunsTable.status, "running"),
        or(
          ...runs.map((run) =>
            and(
              eq(ingestRunsTable.id, run.id),
              eq(ingestRunsTable.heartbeatAt, run.heartbeatAt),
            ),
          ),
        ),
      ),
    )
    .returning({ id: ingestRunsTable.id });
  return rows.length;
};

const defaultDeps: RecoveryDeps = {
  loadRunning,
  failInterrupted,
  wait: (milliseconds) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  now: () => new Date(),
};

/**
 * Observes three 30-second heartbeat intervals before failing only runs whose
 * heartbeat did not move. Commands `collect:*` never call this function, while
 * their heartbeat protects a legitimate manual run in another process.
 */
export async function recoverInterruptedIngestRuns(
  deps: RecoveryDeps = defaultDeps,
): Promise<number> {
  const initial = await deps.loadRunning();
  if (initial.length === 0) return 0;

  await deps.wait(INTERRUPTED_RUN_OBSERVATION_MS);
  const current = await deps.loadRunning(initial.map(({ id }) => id));
  const initialHeartbeat = new Map(
    initial.map(({ id, heartbeatAt }) => [id, heartbeatAt.getTime()]),
  );
  const interrupted = current.filter(
    ({ id, heartbeatAt }) =>
      heartbeatAt.getTime() <= (initialHeartbeat.get(id) ?? -Infinity),
  );
  const recovered = await deps.failInterrupted(interrupted, deps.now());
  if (recovered > 0) {
    logger.warn(
      {
        runIds: interrupted.map(({ id }) => id),
        observationMs: INTERRUPTED_RUN_OBSERVATION_MS,
      },
      "Ingest runs interrupted by an API restart were marked as failed",
    );
  }
  return recovered;
}
