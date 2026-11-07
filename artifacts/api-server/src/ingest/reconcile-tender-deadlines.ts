import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { tryRunSingletonJob } from "../jobs/job-lock";

const HOUR_MS = 60 * 60 * 1000;
/** Startup already runs search facets, collections and the cache warm-up; this job waits for them to settle. */
const STARTUP_DELAY_MS = 2 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_MAX_MS = 5 * 60 * 1000;

const positiveIntEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export type ReconcileOptions = {
  /** Rows per statement; small enough to stay far below the 15 s statement timeout. */
  batchSize?: number;
  /** Time budget for one run; whatever is left goes to the next hourly run. */
  maxMs?: number;
  clock?: () => number;
};

/**
 * A publication does not change when its proposal deadline passes, so PNCP refreshes cannot keep this status current.
 * Only `open` rows with a past deadline move to `under_review`. `direct` (dispensa/inexigibilidade without a
 * deadline) is left alone — there is no window to expire, and we never re-open those as `open` here.
 *
 * Done in small batches: every status change rewrites the row in all of the table's indexes, so a single update
 * over a large backlog outgrew the statement timeout, rolled back, and left the backlog to grow every hour.
 * `skip locked` leaves rows a collection is writing for the next batch instead of waiting on them.
 */
export async function reconcileExpiredTenderStatuses(
  now = new Date(),
  client: Pick<typeof pool, "query"> = pool,
  options: ReconcileOptions = {},
): Promise<number> {
  const batchSize = options.batchSize ?? positiveIntEnv("TENDER_DEADLINE_BATCH_SIZE", DEFAULT_BATCH_SIZE);
  const maxMs = options.maxMs ?? DEFAULT_MAX_MS;
  const clock = options.clock ?? Date.now;
  const startedAt = clock();
  let total = 0;
  for (;;) {
    const result = await client.query(
      `update tenders
       set status = 'under_review', updated_at = $1
       where id in (
         select id from tenders
         where source_id = 'pncp'
           and status = 'open'
           and proposal_deadline < $1
         order by proposal_deadline, id
         limit $2
         for update skip locked
       )`,
      [now, batchSize],
    );
    const updated = result.rowCount ?? 0;
    total += updated;
    if (updated < batchSize || clock() - startedAt >= maxMs) return total;
  }
}

export function startTenderDeadlineReconciliation(): () => void {
  if (!process.env.DATABASE_URL) {
    logger.error("DATABASE_URL is not set; tender deadline reconciliation will not start");
    return () => undefined;
  }

  const run = async () => {
    try {
      const result = await tryRunSingletonJob("tender_deadline_reconciliation", () =>
        reconcileExpiredTenderStatuses(),
      );
      if (result.acquired) {
        logger.info({ updated: result.value }, "Expired tender statuses reconciled");
      }
    } catch (error) {
      logger.error({ err: error }, "Tender deadline reconciliation failed");
    }
  };

  let timer: NodeJS.Timeout | undefined;
  const first = setTimeout(() => {
    void run();
    timer = setInterval(() => void run(), HOUR_MS);
    timer.unref();
  }, STARTUP_DELAY_MS);
  first.unref();
  return () => {
    clearTimeout(first);
    if (timer) clearInterval(timer);
  };
}
