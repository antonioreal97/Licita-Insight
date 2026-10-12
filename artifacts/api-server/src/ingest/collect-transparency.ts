import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db, ingestRunsTable, pncpContractsTable, pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { isUniqueViolation } from "../lib/pg-error";
import { addDays, eachDay, saoPauloToday } from "./ingest-calendar";
import {
  fetchCompraItens,
  fetchContractsByPublicationPage,
  fetchContractsByUpdatePage,
  fetchItemResults,
  isRecoverablePncpFailure,
} from "./pncp-client";
import {
  mapPncpContract,
  PncpTransparencyRecordError,
} from "./pncp-transparency-map";
import { parseControlNumber } from "./pncp-map";
import {
  upsertPncpContracts,
  upsertPncpItemResults,
} from "./upsert-transparency";
import { startIngestRunHeartbeat } from "./run-heartbeat";
import {
  MAX_CONSECUTIVE_RECOVERABLE_REFRESH_FAILURES,
  pncpRefreshMaxConsecutiveFailuresFromEnv,
} from "./pncp-refresh-failure";

const SOURCE = "pncp-transparency";
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const MAX_WINDOW_DAYS = 31;
export const MAX_CONSECUTIVE_RECOVERABLE_RESULT_FAILURES =
  MAX_CONSECUTIVE_RECOVERABLE_REFRESH_FAILURES;

export class TransparencyIngestInProgressError extends Error {
  constructor() {
    super("A transparency ingest is already running");
    this.name = "TransparencyIngestInProgressError";
  }
}

export type TransparencyCollectOptions = {
  from: string;
  to: string;
  pageSize: number;
  resultsLimit: number;
  scanFeeds?: boolean;
};

const validDay = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

export function validateTransparencyCollectOptions(
  options: TransparencyCollectOptions,
): void {
  if (
    !validDay(options.from) ||
    !validDay(options.to) ||
    options.from > options.to ||
    eachDay(options.from, options.to).length > MAX_WINDOW_DAYS
  ) {
    throw new Error(
      `Transparency collection requires a valid window of at most ${MAX_WINDOW_DAYS} days`,
    );
  }
  if (
    !Number.isInteger(options.pageSize) ||
    options.pageSize < 10 ||
    options.pageSize > 500
  ) {
    throw new Error("TRANSPARENCY_PAGE_SIZE must be between 10 and 500");
  }
  if (
    !Number.isInteger(options.resultsLimit) ||
    options.resultsLimit < 0 ||
    options.resultsLimit > 1000
  ) {
    throw new Error("TRANSPARENCY_RESULTS_LIMIT must be between 0 and 1000");
  }
}

const compact = (day: string) => day.replaceAll("-", "");
const dateFor = (day: string) => new Date(`${day}T12:00:00Z`);

type ResultPurchaseCandidate = {
  purchaseControl: string;
};

type ResultPurchaseCounters = {
  results: number;
  purchasesChecked: number;
  purchasesSkipped: number;
  stoppedAfterConsecutiveRecoverableFailures: boolean;
};

type ResultPurchaseDeps = {
  fetchCompraItens: typeof fetchCompraItens;
  fetchItemResults: typeof fetchItemResults;
  upsertPncpItemResults: typeof upsertPncpItemResults;
  markPurchaseChecked: (
    purchaseControl: string,
    checkedAt: Date,
  ) => Promise<void>;
  onProgress?: (counters: ResultPurchaseCounters) => Promise<void>;
  now: () => Date;
  maxConsecutiveRecoverableFailures: number;
};

const resultCounterSnapshot = (
  counters: ResultPurchaseCounters,
): ResultPurchaseCounters => ({
  ...counters,
});

export async function collectTransparencyResultPurchases(
  candidates: ResultPurchaseCandidate[],
  deps: Partial<ResultPurchaseDeps> &
    Pick<ResultPurchaseDeps, "markPurchaseChecked">,
): Promise<ResultPurchaseCounters> {
  const fetchItens = deps.fetchCompraItens ?? fetchCompraItens;
  const fetchResults = deps.fetchItemResults ?? fetchItemResults;
  const upsertResults = deps.upsertPncpItemResults ?? upsertPncpItemResults;
  const now = deps.now ?? (() => new Date());
  const maxConsecutiveRecoverableFailures =
    deps.maxConsecutiveRecoverableFailures ??
    MAX_CONSECUTIVE_RECOVERABLE_RESULT_FAILURES;
  const counters: ResultPurchaseCounters = {
    results: 0,
    purchasesChecked: 0,
    purchasesSkipped: 0,
    stoppedAfterConsecutiveRecoverableFailures: false,
  };
  let consecutiveRecoverableFailures = 0;

  const notifyProgress = async () => {
    await deps.onProgress?.(resultCounterSnapshot(counters));
  };

  for (const { purchaseControl } of candidates) {
    const identity = parseControlNumber(purchaseControl);
    if (!identity) continue;

    try {
      const items = await fetchItens(
        identity.cnpj,
        identity.ano,
        identity.sequencial,
      );
      for (const item of items) {
        if (item.temResultado !== true) continue;
        const itemNumber = Number(item.numeroItem);
        if (!Number.isInteger(itemNumber) || itemNumber < 1) continue;
        const records = await fetchResults({
          cnpj: identity.cnpj,
          purchaseYear: identity.ano,
          purchaseSequence: identity.sequencial,
          itemNumber,
        });
        counters.results += await upsertResults({
          records,
          purchasePncpControlNumber: purchaseControl,
          identity,
          itemNumber,
          fetchedAt: now(),
        });
      }
      await deps.markPurchaseChecked(purchaseControl, now());
      counters.purchasesChecked += 1;
      consecutiveRecoverableFailures = 0;
      await notifyProgress();
    } catch (error) {
      if (!isRecoverablePncpFailure(error)) throw error;
      counters.purchasesSkipped += 1;
      consecutiveRecoverableFailures += 1;
      const reachedRecoverableFailureLimit =
        consecutiveRecoverableFailures >= maxConsecutiveRecoverableFailures;
      counters.stoppedAfterConsecutiveRecoverableFailures =
        reachedRecoverableFailureLimit;
      logger.warn(
        { err: error, purchaseControl, consecutiveRecoverableFailures },
        "PNCP unavailable while collecting purchase results; leaving purchase pending",
      );
      await notifyProgress();
      if (reachedRecoverableFailureLimit) {
        logger.warn(
          { purchaseControl, maxConsecutiveRecoverableFailures },
          "Stopping transparency result collection after consecutive recoverable PNCP failures",
        );
        break;
      }
    }
  }

  return counters;
}

export async function transparencyOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<TransparencyCollectOptions | null> {
  const yesterday = addDays(saoPauloToday(), -1);
  const explicit = Boolean(env.TRANSPARENCY_FROM || env.TRANSPARENCY_TO);
  const [latest] = explicit
    ? []
    : await db
        .select({ windowTo: ingestRunsTable.windowTo })
        .from(ingestRunsTable)
        .where(
          and(
            eq(ingestRunsTable.source, SOURCE),
            eq(ingestRunsTable.status, "complete"),
          ),
        )
        .orderBy(desc(ingestRunsTable.windowTo))
        .limit(1);
  const nextDay = latest
    ? addDays(latest.windowTo.toISOString().slice(0, 10), 1)
    : addDays(yesterday, -6);
  const scanFeeds = explicit || nextDay <= yesterday;
  const from =
    env.TRANSPARENCY_FROM?.trim() || (scanFeeds ? nextDay : yesterday);
  const to =
    env.TRANSPARENCY_TO?.trim() ||
    (explicit
      ? from
      : addDays(from, MAX_WINDOW_DAYS - 1) < yesterday
        ? addDays(from, MAX_WINDOW_DAYS - 1)
        : yesterday);
  const pageSize = env.TRANSPARENCY_PAGE_SIZE
    ? Number(env.TRANSPARENCY_PAGE_SIZE)
    : 500;
  const resultsLimit = env.TRANSPARENCY_RESULTS_LIMIT
    ? Number(env.TRANSPARENCY_RESULTS_LIMIT)
    : 200;
  if (!scanFeeds && resultsLimit > 0) {
    const [pending] = await db
      .select({ id: pncpContractsTable.id })
      .from(pncpContractsTable)
      .where(
        or(
          isNull(pncpContractsTable.resultsCheckedAt),
          lt(
            pncpContractsTable.resultsCheckedAt,
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          ),
        ),
      )
      .limit(1);
    if (!pending) return null;
  }
  if (!scanFeeds && resultsLimit === 0) return null;
  const options = { from, to, pageSize, resultsLimit, scanFeeds };
  validateTransparencyCollectOptions(options);
  return options;
}

export async function abandonStaleTransparencyRuns(
  now = new Date(),
): Promise<number> {
  const rows = await db
    .update(ingestRunsTable)
    .set({
      status: "failed",
      error: "Abandonada: heartbeat da coleta expirou",
      finishedAt: now,
    })
    .where(
      and(
        eq(ingestRunsTable.source, SOURCE),
        eq(ingestRunsTable.status, "running"),
        lt(
          ingestRunsTable.heartbeatAt,
          new Date(now.getTime() - STALE_AFTER_MS),
        ),
      ),
    )
    .returning({ id: ingestRunsTable.id });
  return rows.length;
}

export async function collectTransparency(
  options: TransparencyCollectOptions,
): Promise<{
  runId: string;
  pagesRead: number;
  contracts: number;
  results: number;
}> {
  validateTransparencyCollectOptions(options);
  await abandonStaleTransparencyRuns();
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  try {
    await db.insert(ingestRunsTable).values({
      id: runId,
      source: SOURCE,
      status: "running",
      windowFrom: dateFor(options.from),
      windowTo: dateFor(options.to),
      startedAt,
      heartbeatAt: startedAt,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new TransparencyIngestInProgressError();
    throw error;
  }

  const stopHeartbeat = startIngestRunHeartbeat(runId);
  let pagesRead = 0;
  let contracts = 0;
  let results = 0;
  let skipped = 0;
  let purchasesChecked = 0;
  let purchasesSkipped = 0;
  let resultsInterrupted = false;
  const checkpoint = async (day: string, phase: string) => {
    await db
      .update(ingestRunsTable)
      .set({
        pagesRead,
        upserted: contracts + results,
        refreshed: results,
        refreshErrors: skipped + purchasesSkipped,
        heartbeatAt: new Date(),
        details: {
          day,
          phase,
          contracts,
          results,
          skipped,
          purchasesChecked,
          purchasesSkipped,
          resultsInterrupted,
        },
      })
      .where(eq(ingestRunsTable.id, runId));
  };

  try {
    for (const day of options.scanFeeds === false
      ? []
      : eachDay(options.from, options.to)) {
      for (const [phase, fetchPage] of [
        ["publication", fetchContractsByPublicationPage],
        ["update", fetchContractsByUpdatePage],
      ] as const) {
        for (let page = 1; ; page += 1) {
          const response = await fetchPage({
            from: compact(day),
            to: compact(day),
            page,
            pageSize: options.pageSize,
          });
          pagesRead += 1;
          const valid: Record<string, unknown>[] = [];
          for (const record of response.data) {
            try {
              mapPncpContract(record, new Date());
              valid.push(record);
            } catch (error) {
              if (!(error instanceof PncpTransparencyRecordError)) throw error;
              skipped += 1;
              logger.warn({ err: error }, "Skipping incomplete PNCP contract");
            }
          }
          contracts += await upsertPncpContracts(valid, new Date());
          await checkpoint(day, phase);
          if (page >= response.totalPaginas) break;
        }
      }
    }

    const staleBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const candidates =
      options.resultsLimit === 0
        ? []
        : await db
            .select({
              purchaseControl: pncpContractsTable.purchasePncpControlNumber,
              checkedAt: sql<Date | null>`min(${pncpContractsTable.resultsCheckedAt})`,
            })
            .from(pncpContractsTable)
            .where(
              or(
                isNull(pncpContractsTable.resultsCheckedAt),
                lt(pncpContractsTable.resultsCheckedAt, staleBefore),
              ),
            )
            .groupBy(pncpContractsTable.purchasePncpControlNumber)
            .orderBy(
              sql`min(${pncpContractsTable.resultsCheckedAt}) asc nulls first`,
              asc(pncpContractsTable.purchasePncpControlNumber),
            )
            .limit(options.resultsLimit);

    const resultBatch = await collectTransparencyResultPurchases(candidates, {
      maxConsecutiveRecoverableFailures:
        pncpRefreshMaxConsecutiveFailuresFromEnv(),
      markPurchaseChecked: async (purchaseControl, checkedAt) => {
        await db
          .update(pncpContractsTable)
          .set({ resultsCheckedAt: checkedAt })
          .where(
            eq(pncpContractsTable.purchasePncpControlNumber, purchaseControl),
          );
      },
      onProgress: async (progress) => {
        results = progress.results;
        purchasesChecked = progress.purchasesChecked;
        purchasesSkipped = progress.purchasesSkipped;
        resultsInterrupted =
          progress.stoppedAfterConsecutiveRecoverableFailures;
        await checkpoint(options.to, "results");
      },
    });
    results = resultBatch.results;
    purchasesChecked = resultBatch.purchasesChecked;
    purchasesSkipped = resultBatch.purchasesSkipped;
    resultsInterrupted = resultBatch.stoppedAfterConsecutiveRecoverableFailures;

    await db
      .update(ingestRunsTable)
      .set({
        status: "complete",
        pagesRead,
        upserted: contracts + results,
        refreshed: results,
        refreshErrors: skipped + purchasesSkipped,
        error:
          [
            skipped ? `${skipped} contratos incompletos foram ignorados` : null,
            purchasesSkipped
              ? `${purchasesSkipped} compras tiveram resultados adiados por falha recuperável do PNCP`
              : null,
          ]
            .filter(Boolean)
            .join("; ") || null,
        details: {
          contracts,
          results,
          skipped,
          purchasesChecked,
          purchasesSkipped,
          resultsInterrupted,
          scanFeeds: options.scanFeeds !== false,
        },
        finishedAt: new Date(),
        heartbeatAt: new Date(),
      })
      .where(eq(ingestRunsTable.id, runId));
    return { runId, pagesRead, contracts, results };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(ingestRunsTable)
      .set({
        status: "failed",
        pagesRead,
        upserted: contracts + results,
        refreshed: results,
        refreshErrors: skipped + purchasesSkipped + 1,
        error: message,
        details: {
          contracts,
          results,
          skipped,
          purchasesChecked,
          purchasesSkipped,
          resultsInterrupted,
          scanFeeds: options.scanFeeds !== false,
        },
        finishedAt: new Date(),
        heartbeatAt: new Date(),
      })
      .where(eq(ingestRunsTable.id, runId));
    throw error;
  } finally {
    stopHeartbeat();
  }
}

const isCli = process.argv[1]?.endsWith("collect-transparency.ts");
if (isCli) {
  transparencyOptionsFromEnv()
    .then(async (options) => options && (await collectTransparency(options)))
    .then((result) =>
      logger.info({ result }, "Transparency collection finished"),
    )
    .catch((error) => {
      logger.error({ err: error }, "Transparency collection failed");
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
