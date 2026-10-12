import { and, eq, lt } from "drizzle-orm";
import { db, ingestRunsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { isUniqueViolation } from "../lib/pg-error";
import { collectInternationalOnce } from "./international-client";
import {
  defaultInternationalFetch,
  type InternationalFetch,
} from "./international-http";
import {
  translateTitles,
  translationConfig,
  translatorFromConfig,
  type TitleTranslator,
  type TranslationOutcome,
} from "./international-translation";
import { fetchPtaxQuotes, type PtaxQuote } from "./ptax-client";
import {
  internationalCounts,
  internationalCurrencies,
  internationalSourceSummary,
} from "./international-report";
import {
  closeMissingSourceOpportunities,
  pendingInternationalTitles,
  recordTranslationAttempt,
  refreshOpportunityStatuses,
  saveTranslatedTitle,
  upsertInternationalOpportunities,
} from "./upsert-opportunities";
import { startIngestRunHeartbeat } from "./run-heartbeat";

const INGEST_SOURCE = "international";
export const INTERNATIONAL_STALE_AFTER_MS = 30 * 60 * 1_000;

export class InternationalIngestInProgressError extends Error {
  constructor() {
    super("An international opportunities ingest is already running");
    this.name = "InternationalIngestInProgressError";
  }
}

export async function abandonStaleInternationalRuns(
  now = new Date(),
): Promise<number> {
  const staleBefore = new Date(now.getTime() - INTERNATIONAL_STALE_AFTER_MS);
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

/**
 * Translates what the collection left without a Portuguese title. It runs after the run is recorded and
 * never throws: the collection does not wait on, or fail with, the translation.
 */
export async function translatePendingInternationalTitles(
  options: {
    translator?: TitleTranslator | null;
    now?: Date;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<TranslationOutcome | null> {
  try {
    const config = translationConfig(options.env);
    const translator =
      options.translator === undefined
        ? translatorFromConfig(config)
        : options.translator;
    if (!translator) return null;
    const pending = await pendingInternationalTitles(
      config.languages,
      config.batchSize,
    );
    return await translateTitles(
      pending,
      translator,
      (id, titlePt) =>
        saveTranslatedTitle(id, titlePt, options.now ?? new Date()),
      recordTranslationAttempt,
    );
  } catch (error) {
    logger.warn({ err: error }, "International title translation was skipped");
    return null;
  }
}

export type CollectInternationalResult = {
  runId: string;
  status: "complete" | "failed";
  sources: ReturnType<typeof internationalSourceSummary>;
  counts: ReturnType<typeof internationalCounts>;
  upserted: number;
  closed: number;
  ptax: { quotes: PtaxQuote[]; errors: string[] };
  translation: TranslationOutcome | null;
};

export async function collectInternational(
  now = new Date(),
  options: {
    collect?: typeof collectInternationalOnce;
    /** Fetcher of the PTAX quotes; the source collectors bring their own. */
    ptaxFetcher?: InternationalFetch;
    translator?: TitleTranslator | null;
  } = {},
): Promise<CollectInternationalResult> {
  const collect = options.collect ?? collectInternationalOnce;
  await abandonStaleInternationalRuns(now);
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
      throw new InternationalIngestInProgressError();
    throw error;
  }

  const stopHeartbeat = startIngestRunHeartbeat(runId);
  let result: Omit<CollectInternationalResult, "translation">;
  try {
    const sources = await collect({ now });
    const drafts = sources.flatMap((source) => source.drafts);
    const ptax = await fetchPtaxQuotes(internationalCurrencies(drafts), {
      fetcher: options.ptaxFetcher ?? defaultInternationalFetch,
      now,
    });
    const counts = internationalCounts(drafts);
    const details = {
      sources: internationalSourceSummary(sources),
      counts,
      ptax: { quotes: [...ptax.quotes.values()], errors: ptax.errors },
    };
    let upserted = 0;
    let closed = 0;
    for (const source of sources) {
      upserted += await upsertInternationalOpportunities(
        source.drafts,
        ptax.quotes,
        now,
      );
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
    const errors = [
      ...sources
        .filter((source) => source.outcome !== "ok")
        .map((source) => `${source.source}: ${source.message}`),
      ...ptax.errors,
    ];
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
    result = {
      runId,
      status,
      sources: details.sources,
      counts,
      upserted,
      closed,
      ptax: details.ptax,
    };
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

  const translation = await translatePendingInternationalTitles({
    translator: options.translator,
    now,
  });
  if (translation)
    await db
      .update(ingestRunsTable)
      .set({
        details: {
          sources: result.sources,
          counts: result.counts,
          ptax: result.ptax,
          translation,
        },
      })
      .where(eq(ingestRunsTable.id, runId))
      .catch((error: unknown) =>
        logger.warn({ err: error }, "Could not record the translation outcome"),
      );
  return { ...result, translation };
}
