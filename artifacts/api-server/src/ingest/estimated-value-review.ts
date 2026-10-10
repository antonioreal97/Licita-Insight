import { setTimeout as sleep } from "node:timers/promises";
import { ESTIMATED_VALUE_REVIEW_FLOOR, pool } from "@workspace/db";
import { assessEstimatedValue } from "../domain/estimated-value-plausibility";
import { tryRunSingletonJob } from "../jobs/job-lock";
import { logger } from "../lib/logger";
import { millisecondsUntilSaoPauloHour } from "../lib/sao-paulo-schedule";
import { clearOpenTendersByStateCache } from "../services/open-tenders-by-state";

export type EstimatedValueReviewBatchResult = {
  scanned: number;
  updated: number;
  nextCursor: string | null;
};

type ReviewRow = {
  id: string;
  modality: string;
  value: string;
  flag: string | null;
  legal_basis: string | null;
};

/**
 * One cursor-bounded batch. Only tenders at or above the review floor are read (no rule flags a lower value),
 * through the partial index `tenders_estimated_value_review_idx`; the floor is written as a literal so the
 * planner can match the index predicate. Only rows whose flag changes are written, and only if the value and
 * the modality are still the ones that were judged.
 */
export async function reviewEstimatedValueBatch(options: {
  afterId?: string | null;
  batch?: number;
} = {}): Promise<EstimatedValueReviewBatchResult> {
  const batch = Math.max(1, Math.min(5_000, options.batch ?? 1_000));
  const rows = (await pool.query<ReviewRow>(
    `select id, modality, estimated_value::text as value, estimated_value_flag as flag,
            case when modality = 'dispensa'
              then coalesce(raw_payload->'publication', raw_payload)->'amparoLegal'->>'nome'
            end as legal_basis
     from tenders
     where id > $1 and estimated_value >= ${ESTIMATED_VALUE_REVIEW_FLOOR}
     order by id
     limit $2`,
    [options.afterId ?? "", batch],
  )).rows;
  if (rows.length === 0) return { scanned: 0, updated: 0, nextCursor: null };

  const changed = rows
    .map((row) => ({
      ...row,
      next: assessEstimatedValue({ value: row.value, modality: row.modality, legalBasis: row.legal_basis }),
    }))
    .filter((row) => row.next !== row.flag);
  const result = changed.length === 0
    ? { rowCount: 0 }
    : await pool.query(
        `update tenders t set estimated_value_flag = v.flag
         from unnest($1::text[], $2::text[], $3::text[], $4::numeric[]) as v(id, flag, modality, value)
         where t.id = v.id
           and t.modality = v.modality
           and t.estimated_value = v.value
           and t.estimated_value_flag is distinct from v.flag`,
        [
          changed.map(({ id }) => id),
          changed.map(({ next }) => next),
          changed.map(({ modality }) => modality),
          changed.map(({ value }) => value),
        ],
      );
  return {
    scanned: rows.length,
    updated: result.rowCount ?? 0,
    nextCursor: rows.at(-1)?.id ?? null,
  };
}

export const estimatedValueReviewBatchSize = (): number => {
  const raw = process.env.ESTIMATED_VALUE_REVIEW_BATCH_SIZE?.trim();
  if (!raw) return 1_000;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 5_000) {
    throw new Error("ESTIMATED_VALUE_REVIEW_BATCH_SIZE must be an integer between 1 and 5000");
  }
  return value;
};

export type EstimatedValueReviewResult = {
  batches: number;
  scanned: number;
  updated: number;
  stopped: boolean;
};

/** Walks every tender at or above the review floor, batch by batch; `shouldStop` is checked between batches. */
export async function reviewEstimatedValues(options: {
  batch: number;
  pauseMs: number;
  shouldStop?: () => boolean;
}): Promise<EstimatedValueReviewResult> {
  const totals: EstimatedValueReviewResult = { batches: 0, scanned: 0, updated: 0, stopped: false };
  let afterId: string | null = null;
  for (;;) {
    if (options.shouldStop?.()) return { ...totals, stopped: true };
    const result = await reviewEstimatedValueBatch({ afterId, batch: options.batch });
    if (!result.nextCursor) return totals;
    totals.batches += 1;
    totals.scanned += result.scanned;
    totals.updated += result.updated;
    logger.info(
      { batch: totals.batches, scanned: totals.scanned, updated: totals.updated, cursor: result.nextCursor },
      "Tender estimated value review progress",
    );
    afterId = result.nextCursor;
    if (options.pauseMs > 0) await sleep(options.pauseMs);
  }
}

const ESTIMATED_VALUE_REVIEW_HOUR = 1;
const ESTIMATED_VALUE_REVIEW_PAUSE_MS = 1_000;

/**
 * The ingest flags what it collects; this fills the tenders collected before the flag existed and re-judges
 * every candidate after a change of limits. It needs no "pending" marker: the candidates are few, a second
 * run finds nothing to write, and an interrupted run is simply repeated.
 */
export async function runEstimatedValueReview(
  reason: string,
  shouldStop?: () => boolean,
): Promise<EstimatedValueReviewResult | null> {
  const batch = estimatedValueReviewBatchSize();
  const result = await tryRunSingletonJob("tender_estimated_value_review", () =>
    reviewEstimatedValues({ batch, pauseMs: ESTIMATED_VALUE_REVIEW_PAUSE_MS, shouldStop }),
  );
  if (!result.acquired) {
    logger.info({ reason }, "Tender estimated value review skipped: another worker holds the lock");
    return null;
  }
  logger.info({ reason, ...result.value }, "Tender estimated value review finished");
  // The per-state sums changed; where the API runs in another process, its cache expires on its own (15 min).
  if (result.value.updated > 0) clearOpenTendersByStateCache();
  return result.value;
}

/** Runs once at startup and daily at 01:00 (São Paulo), away from the 06:00 PNCP collect. */
export function startEstimatedValueReviewScheduler(): () => void {
  if (process.env.ESTIMATED_VALUE_REVIEW_DAILY === "false") {
    logger.info("Tender estimated value review is disabled");
    return () => undefined;
  }
  if (!process.env.DATABASE_URL) {
    logger.error("DATABASE_URL is not set; tender estimated value review will not start");
    return () => undefined;
  }
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const run = (reason: string) =>
    runEstimatedValueReview(reason, () => stopped).catch((error) =>
      logger.error({ err: error, reason }, "Tender estimated value review failed"),
    );
  const arm = () => {
    if (stopped) return;
    const delayMs = millisecondsUntilSaoPauloHour(ESTIMATED_VALUE_REVIEW_HOUR);
    logger.info({ hour: ESTIMATED_VALUE_REVIEW_HOUR, delayMs }, "Next tender estimated value review scheduled");
    timer = setTimeout(() => {
      void run("schedule").finally(arm);
    }, delayMs);
    timer.unref();
  };
  void run("startup");
  arm();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
