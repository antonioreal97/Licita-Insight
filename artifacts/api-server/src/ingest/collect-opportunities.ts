import { and, desc, eq, lt, ne } from "drizzle-orm";
import { db, ingestRunsTable, pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { isUniqueViolation } from "../lib/pg-error";
import type { MapasInstallation } from "./cultural-installations";
import {
  collectInstallations,
  coverageFromDetails,
  cultureLookbackDays,
  pendingCoverage,
  type InstallationCoverage,
  type StoredInstallation,
} from "./collect-installations";
import type { FetchOpportunitiesResult } from "./mapas-client";
import {
  closeMissingOpportunities,
  refreshOpportunityStatuses,
  upsertOpportunities,
} from "./upsert-opportunities";

export {
  coverageFromDetails,
  cultureLookbackDays,
  pendingCoverage,
  type InstallationCoverage,
} from "./collect-installations";

const SOURCE = "mapas-culturais";
export const STALE_AFTER_MS = 30 * 60 * 1000;
const PREVIOUS_RUNS_READ = 5;

export class CultureIngestInProgressError extends Error {
  constructor() {
    super("A cultural opportunities ingest is already running");
    this.name = "CultureIngestInProgressError";
  }
}

const windowFor = (now: Date, days: number): { from: Date; to: Date } => {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start, to: now };
};

/** Latest coverage row per install over the last few runs: an abandoned run records only part of them. */
async function previousCoverage(
  runId: string,
): Promise<Map<string, InstallationCoverage>> {
  const runs = await db
    .select({ details: ingestRunsTable.details })
    .from(ingestRunsTable)
    .where(
      and(eq(ingestRunsTable.source, SOURCE), ne(ingestRunsTable.id, runId)),
    )
    .orderBy(desc(ingestRunsTable.startedAt))
    .limit(PREVIOUS_RUNS_READ);
  const latest = new Map<string, InstallationCoverage>();
  for (const run of runs) {
    for (const row of coverageFromDetails(run.details) ?? []) {
      if (!latest.has(row.id) && row.outcome !== "pending")
        latest.set(row.id, row);
    }
  }
  return latest;
}

async function storeInstallation(
  installation: MapasInstallation,
  result: FetchOpportunitiesResult,
  now: Date,
): Promise<StoredInstallation> {
  const upserted = await upsertOpportunities(result.drafts, now);
  const closed = result.complete
    ? await closeMissingOpportunities(
        installation.id,
        result.drafts.map((draft) => draft.externalId),
        now,
      )
    : 0;
  return { upserted, closed };
}

async function execute(runId: string, now: Date): Promise<void> {
  let coverage: InstallationCoverage[] = [];

  try {
    const refreshed = await refreshOpportunityStatuses(now);
    await db
      .update(ingestRunsTable)
      .set({ refreshed, heartbeatAt: new Date() })
      .where(eq(ingestRunsTable.id, runId));

    const summary = await collectInstallations(now, {
      previous: await previousCoverage(runId),
      store: (installation, result) =>
        storeInstallation(installation, result, now),
      onProgress: async (progress) => {
        coverage = progress.coverage;
        await db
          .update(ingestRunsTable)
          .set({
            pagesRead: progress.pagesRead,
            upserted: progress.upserted,
            refreshed: refreshed + progress.closed,
            refreshErrors: progress.failed,
            heartbeatAt: new Date(),
            details: { installations: progress.coverage },
          })
          .where(eq(ingestRunsTable.id, runId));
      },
    });
    coverage = summary.coverage;

    const allFailed =
      summary.attempted > 0 && summary.failed === summary.attempted;
    await db
      .update(ingestRunsTable)
      .set({
        status: allFailed ? "failed" : "complete",
        pagesRead: summary.pagesRead,
        upserted: summary.upserted,
        refreshed: refreshed + summary.closed,
        refreshErrors: summary.failed,
        error: summary.failures.length > 0 ? summary.failures.join("\n") : null,
        details: { installations: coverage },
        finishedAt: new Date(),
        heartbeatAt: new Date(),
      })
      .where(eq(ingestRunsTable.id, runId));
    logger.info(
      {
        runId,
        pagesRead: summary.pagesRead,
        upserted: summary.upserted,
        closed: summary.closed,
        refreshErrors: summary.failed,
      },
      "Cultural opportunities ingest finished",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, runId }, "Cultural opportunities ingest failed");
    await db
      .update(ingestRunsTable)
      .set({
        status: "failed",
        error: message,
        details: { installations: coverage },
        finishedAt: new Date(),
        heartbeatAt: new Date(),
      })
      .where(eq(ingestRunsTable.id, runId));
  }
}

export async function startCultureIngest(
  now = new Date(),
): Promise<{ runId: string; status: "running" }> {
  await abandonStaleCultureRuns(now);
  const days = cultureLookbackDays();
  const window = windowFor(now, days);
  const runId = crypto.randomUUID();
  try {
    await db.insert(ingestRunsTable).values({
      id: runId,
      source: SOURCE,
      status: "running",
      windowFrom: window.from,
      windowTo: window.to,
      startedAt: now,
      heartbeatAt: now,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new CultureIngestInProgressError();
    throw error;
  }

  void execute(runId, now).catch((error) => {
    logger.error(
      { err: error, runId },
      "Cultural opportunities ingest crashed before recording the failure",
    );
  });
  return { runId, status: "running" };
}

export async function abandonStaleCultureRuns(
  now = new Date(),
): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const abandoned = await db
    .update(ingestRunsTable)
    .set({
      status: "failed",
      error: "Abandonada: heartbeat da coleta expirou",
      finishedAt: now,
      heartbeatAt: now,
    })
    .where(
      and(
        eq(ingestRunsTable.source, SOURCE),
        eq(ingestRunsTable.status, "running"),
        lt(ingestRunsTable.heartbeatAt, staleBefore),
      ),
    )
    .returning({ id: ingestRunsTable.id });

  if (abandoned.length > 0) {
    logger.warn(
      { runIds: abandoned.map(({ id }) => id), staleBefore },
      "Stale cultural opportunities ingest runs marked as failed",
    );
  }
  return abandoned.length;
}

const serializeRun = (run: typeof ingestRunsTable.$inferSelect) => ({
  id: run.id,
  status: run.status,
  windowFrom: run.windowFrom,
  windowTo: run.windowTo,
  pagesRead: run.pagesRead,
  upserted: run.upserted,
  refreshed: run.refreshed,
  refreshErrors: run.refreshErrors,
  error: run.error,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  coverage: coverageFromDetails(run.details) ?? pendingCoverage(),
});

export async function getLatestCultureIngest() {
  await abandonStaleCultureRuns();
  const [run] = await db
    .select()
    .from(ingestRunsTable)
    .where(eq(ingestRunsTable.source, SOURCE))
    .orderBy(desc(ingestRunsTable.startedAt))
    .limit(1);

  return {
    run: run ? serializeRun(run) : null,
    coverage: run
      ? (coverageFromDetails(run.details) ?? pendingCoverage())
      : pendingCoverage(),
  };
}

const isCli = process.argv[1]?.includes("collect-opportunities");

if (isCli) {
  logger.info(
    { lookbackDays: cultureLookbackDays() },
    "Starting cultural opportunities ingest",
  );
  startCultureIngest()
    .then(async ({ runId }) => {
      const started = Date.now();
      while (Date.now() - started < 6 * 60 * 60 * 1000) {
        const latest = await getLatestCultureIngest();
        if (latest.run?.id === runId && latest.run.status !== "running") {
          if (latest.run.status === "failed") {
            logger.error(
              { run: latest.run },
              "Cultural opportunities ingest failed",
            );
            process.exitCode = 1;
          } else {
            logger.info({ run: latest.run }, "Cultural opportunities stored");
          }
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      throw new Error(
        `Cultural opportunities ingest ${runId} did not finish within 6 hours`,
      );
    })
    .catch((error) => {
      logger.error({ err: error }, "Cultural opportunities ingest failed");
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
      process.exit(process.exitCode ?? 0);
    });
}
