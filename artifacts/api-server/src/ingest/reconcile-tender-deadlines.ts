import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { tryRunSingletonJob } from "../jobs/job-lock";

const HOUR_MS = 60 * 60 * 1000;

/**
 * A publication does not change when its proposal deadline passes, so PNCP refreshes cannot keep this status current.
 * Only `open` rows with a past deadline move to `under_review`. `direct` (dispensa/inexigibilidade without a
 * deadline) is left alone — there is no window to expire, and we never re-open those as `open` here.
 */
export async function reconcileExpiredTenderStatuses(
  now = new Date(),
  client: Pick<typeof pool, "query"> = pool,
): Promise<number> {
  const result = await client.query(
    `update tenders
     set status = 'under_review', updated_at = $1
     where source_id = 'pncp'
       and status = 'open'
       and proposal_deadline < $1`,
    [now],
  );
  return result.rowCount ?? 0;
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

  void run();
  const timer = setInterval(() => void run(), HOUR_MS);
  timer.unref();
  return () => clearInterval(timer);
}
