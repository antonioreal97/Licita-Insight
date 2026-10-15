import { and, eq, lt } from "drizzle-orm";
import { db, ingestRunsTable, pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { isUniqueViolation } from "../lib/pg-error";
import { collectFundingOnce, type FundingSourceResult } from "./funding-client";
import {
  refreshOpportunityStatuses,
  upsertFundingOpportunities,
} from "./upsert-opportunities";
import { startIngestRunHeartbeat } from "./run-heartbeat";
import {
  readApplicationsSafely,
  type ApplicationReader,
} from "./application-enrichment";

const INGEST_SOURCE = "funding-opportunities";
export const FUNDING_STALE_AFTER_MS = 30 * 60 * 1_000;

export class FundingIngestInProgressError extends Error {
  constructor() {
    super("A funding opportunities ingest is already running");
    this.name = "FundingIngestInProgressError";
  }
}

export async function abandonStaleFundingRuns(
  now = new Date(),
): Promise<number> {
  const staleBefore = new Date(now.getTime() - FUNDING_STALE_AFTER_MS);
  const rows = await db
    .update(ingestRunsTable)
    .set({
      status: "failed",
      error: "Abandonada: heartbeat da coleta expirou",
      finishedAt: now,
      heartbeatAt: now,
    })
    .where(
      and(
        eq(ingestRunsTable.source, INGEST_SOURCE),
        eq(ingestRunsTable.status, "running"),
        lt(ingestRunsTable.heartbeatAt, staleBefore),
      ),
    )
    .returning({ id: ingestRunsTable.id });
  return rows.length;
}

export async function collectFunding(
  now = new Date(),
  readApplications: ApplicationReader = readApplicationsSafely,
): Promise<{
  runId: string;
  status: "complete" | "failed";
  sources: FundingSourceResult[];
  upserted: number;
}> {
  await abandonStaleFundingRuns(now);
  const runId = crypto.randomUUID();
  try {
    await db.insert(ingestRunsTable).values({
      id: runId,
      source: INGEST_SOURCE,
      status: "running",
      windowFrom: now,
      windowTo: now,
      startedAt: now,
      heartbeatAt: now,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new FundingIngestInProgressError();
    throw error;
  }

  const stopHeartbeat = startIngestRunHeartbeat(runId);
  try {
    const refreshed = await refreshOpportunityStatuses(now);
    const sources = await collectFundingOnce({ now });
    let upserted = 0;
    for (const source of sources) {
      upserted += await upsertFundingOpportunities(source.drafts, now);
      await db
        .update(ingestRunsTable)
        .set({ heartbeatAt: new Date(), upserted, details: { sources } })
        .where(eq(ingestRunsTable.id, runId));
    }
    // Where to apply: read after the calls are stored, never failing the run.
    const applications = await readApplications(
      ["capes", "cnpq", "finep"],
      now,
    );
    const ok = sources.some((source) => source.outcome === "ok");
    const status = ok ? "complete" : "failed";
    const errors = sources
      .filter((source) => source.outcome !== "ok")
      .map((source) => `${source.source}: ${source.message}`);
    await db
      .update(ingestRunsTable)
      .set({
        status,
        pagesRead: sources.filter((source) => source.outcome === "ok").length,
        upserted,
        refreshed,
        refreshErrors: errors.length,
        error: errors.length ? errors.join("\n") : null,
        details: { sources, applications },
        heartbeatAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(ingestRunsTable.id, runId));
    return { runId, status, sources, upserted };
  } catch (error) {
    await db
      .update(ingestRunsTable)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        heartbeatAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(ingestRunsTable.id, runId));
    throw error;
  } finally {
    stopHeartbeat();
  }
}

const isCli = process.argv[1]?.endsWith("collect-funding.ts");
if (isCli) {
  const dryRun = process.env.FUNDING_DRY_RUN === "true";
  (dryRun ? collectFundingOnce() : collectFunding())
    .then((result) => {
      const summary = Array.isArray(result)
        ? result.map(({ source, outcome, count, message }) => ({
            source,
            outcome,
            count,
            message,
          }))
        : result;
      logger.info(
        { result: summary, dryRun },
        "Funding opportunities collection finished",
      );
    })
    .catch((error) => {
      logger.error({ err: error }, "Funding opportunities collection failed");
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
      process.exit(process.exitCode ?? 0);
    });
}
