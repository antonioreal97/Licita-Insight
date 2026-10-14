import { and, eq, lt } from "drizzle-orm";
import { db, ingestRunsTable, pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { isUniqueViolation } from "../lib/pg-error";
import { collectFederalOnce, type FederalSourceResult } from "./federal-client";
import {
  closeMissingSourceOpportunities,
  refreshOpportunityStatuses,
  upsertFundingOpportunities,
} from "./upsert-opportunities";
import { startIngestRunHeartbeat } from "./run-heartbeat";

const INGEST_SOURCE = "culture-federal";
export const CULTURE_FEDERAL_STALE_AFTER_MS = 30 * 60 * 1_000;

export class CultureFederalIngestInProgressError extends Error {
  constructor() {
    super("A federal culture opportunities ingest is already running");
    this.name = "CultureFederalIngestInProgressError";
  }
}

/** The run row keeps what was read and why, not the calls themselves. */
const summaryOf = (sources: FederalSourceResult[]) =>
  sources.map(({ drafts: _drafts, ...summary }) => summary);

export async function abandonStaleCultureFederalRuns(
  now = new Date(),
): Promise<number> {
  const staleBefore = new Date(now.getTime() - CULTURE_FEDERAL_STALE_AFTER_MS);
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

export async function collectCultureFederal(
  now = new Date(),
  collect: typeof collectFederalOnce = collectFederalOnce,
): Promise<{
  runId: string;
  status: "complete" | "failed";
  sources: ReturnType<typeof summaryOf>;
  upserted: number;
  closed: number;
}> {
  await abandonStaleCultureFederalRuns(now);
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
    if (isUniqueViolation(error))
      throw new CultureFederalIngestInProgressError();
    throw error;
  }

  const stopHeartbeat = startIngestRunHeartbeat(runId);
  try {
    const sources = await collect({ now });
    const details = { sources: summaryOf(sources) };
    let upserted = 0;
    let closed = 0;
    for (const source of sources) {
      upserted += await upsertFundingOpportunities(source.drafts, now);
      // Only a listing read to the end can say that a call is gone.
      if (source.complete)
        closed += await closeMissingSourceOpportunities(
          source.source,
          source.drafts.map((draft) => draft.externalId),
          now,
        );
      await db
        .update(ingestRunsTable)
        .set({ heartbeatAt: new Date(), upserted, details })
        .where(eq(ingestRunsTable.id, runId));
    }
    const refreshed = (await refreshOpportunityStatuses(now)) + closed;
    const read = sources.filter(
      (source) => source.outcome === "ok" || source.outcome === "partial",
    );
    const status = read.length > 0 ? "complete" : "failed";
    const errors = sources
      .filter((source) => source.outcome !== "ok")
      .map((source) => `${source.source}: ${source.message}`);
    await db
      .update(ingestRunsTable)
      .set({
        status,
        pagesRead: sources.reduce(
          (total, source) => total + source.requests,
          0,
        ),
        upserted,
        refreshed,
        refreshErrors: errors.length,
        error: errors.length ? errors.join("\n") : null,
        details,
        heartbeatAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(ingestRunsTable.id, runId));
    return { runId, status, sources: details.sources, upserted, closed };
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

const isCli = process.argv[1]?.endsWith("collect-culture-federal.ts");
if (isCli) {
  // CULTURE_FEDERAL_DRY_RUN=true reads the sources and prints what it found, without touching the database.
  const dryRun = process.env.CULTURE_FEDERAL_DRY_RUN === "true";
  (dryRun
    ? collectFederalOnce().then((sources) => ({
        sources: summaryOf(sources),
        calls: sources.flatMap((source) =>
          source.drafts.map((draft) => ({
            source: draft.source,
            status: draft.status,
            kind: draft.kind,
            title: draft.title,
            organizationName: draft.organizationName,
            registrationFrom: draft.registrationFrom,
            registrationTo: draft.registrationTo,
            state: draft.state,
            areas: draft.areas,
            documents: draft.documents.length,
            sourceUrl: draft.sourceUrl,
          })),
        ),
      }))
    : collectCultureFederal()
  )
    .then((result) => {
      logger.info(
        { result, dryRun },
        "Federal culture opportunities collection finished",
      );
    })
    .catch((error) => {
      logger.error(
        { err: error },
        "Federal culture opportunities collection failed",
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
      process.exit(process.exitCode ?? 0);
    });
}
