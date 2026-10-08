import { setTimeout as sleep } from "node:timers/promises";
import { pool } from "@workspace/db";
import { platformFromPublication } from "../catalog/tender-platforms";
import { tryRunSingletonJob } from "../jobs/job-lock";
import { logger } from "../lib/logger";
import { millisecondsUntilSaoPauloHour } from "../lib/sao-paulo-schedule";

export type PlatformBackfillBatchResult = {
  scanned: number;
  updated: number;
  nextCursor: string | null;
};

/** One cursor-bounded batch of the resumable platform backfill. Only rows still without platform are touched. */
export async function backfillTenderPlatformBatch(options: {
  afterId?: string | null;
  batch?: number;
} = {}): Promise<PlatformBackfillBatchResult> {
  const batch = Math.max(1, Math.min(5_000, options.batch ?? 1_000));
  const rows = (await pool.query<{ id: string; publication: Record<string, unknown> | null }>(
    `select id, raw_payload->'publication' as publication
     from tenders
     where id > $1 and platform is null
     order by id
     limit $2`,
    [options.afterId ?? "", batch],
  )).rows;
  if (rows.length === 0) return { scanned: 0, updated: 0, nextCursor: null };

  const resolved = rows.map((row) => ({
    id: row.id,
    ...platformFromPublication(row.publication ?? {}),
  }));
  const result = await pool.query(
    `update tenders t set platform = v.platform, platform_label = v.label
     from unnest($1::text[], $2::text[], $3::text[]) as v(id, platform, label)
     where t.id = v.id and t.platform is null`,
    [resolved.map(({ id }) => id), resolved.map(({ slug }) => slug),
      resolved.map(({ label }) => label)],
  );
  return {
    scanned: rows.length,
    updated: result.rowCount ?? 0,
    nextCursor: rows.at(-1)?.id ?? null,
  };
}

export const platformBackfillBatchSize = (): number => {
  const raw = process.env.PLATFORM_BACKFILL_BATCH_SIZE?.trim();
  if (!raw) return 2_000;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 5_000) {
    throw new Error("PLATFORM_BACKFILL_BATCH_SIZE must be an integer between 1 and 5000");
  }
  return value;
};

export type PlatformBackfillResult = {
  batches: number;
  scanned: number;
  updated: number;
  stopped: boolean;
};

/** Walks every tender still without platform, batch by batch, logging progress; `shouldStop` is checked between batches. */
export async function backfillTenderPlatforms(options: {
  batch: number;
  pauseMs: number;
  shouldStop?: () => boolean;
}): Promise<PlatformBackfillResult> {
  const totals: PlatformBackfillResult = { batches: 0, scanned: 0, updated: 0, stopped: false };
  let afterId: string | null = null;
  for (;;) {
    if (options.shouldStop?.()) return { ...totals, stopped: true };
    const result = await backfillTenderPlatformBatch({ afterId, batch: options.batch });
    if (!result.nextCursor) return totals;
    totals.batches += 1;
    totals.scanned += result.scanned;
    totals.updated += result.updated;
    logger.info(
      { batch: totals.batches, scanned: totals.scanned, updated: totals.updated, cursor: result.nextCursor },
      "Tender platform backfill progress",
    );
    afterId = result.nextCursor;
    if (options.pauseMs > 0) await sleep(options.pauseMs);
  }
}

const PLATFORM_BACKFILL_HOUR = 2;
const PLATFORM_BACKFILL_PAUSE_MS = 1_000;

/** Cheap guard so the daily run does nothing once every tender has a platform (ingest fills new ones). */
export async function runTenderPlatformBackfill(
  reason: string,
  shouldStop?: () => boolean,
): Promise<PlatformBackfillResult | null> {
  const pending = await pool.query<{ pending: boolean }>(
    "select exists (select 1 from tenders where platform is null) as pending",
  );
  if (!pending.rows[0]?.pending) {
    logger.info({ reason }, "Tender platform backfill skipped: no tender without platform");
    return null;
  }
  const batch = platformBackfillBatchSize();
  logger.info({ reason, batch }, "Tender platform backfill started");
  const result = await tryRunSingletonJob("tender_platform_backfill", () =>
    backfillTenderPlatforms({ batch, pauseMs: PLATFORM_BACKFILL_PAUSE_MS, shouldStop }),
  );
  if (!result.acquired) {
    logger.info({ reason }, "Tender platform backfill skipped: another worker holds the lock");
    return null;
  }
  logger.info({ reason, ...result.value }, "Tender platform backfill finished");
  return result.value;
}

/** Runs once at startup and daily at 02:00 (São Paulo), away from the 06:00 PNCP collect. */
export function startPlatformBackfillScheduler(): () => void {
  if (process.env.PLATFORM_BACKFILL_DAILY === "false") {
    logger.info("Tender platform backfill is disabled");
    return () => undefined;
  }
  if (!process.env.DATABASE_URL) {
    logger.error("DATABASE_URL is not set; tender platform backfill will not start");
    return () => undefined;
  }
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const run = (reason: string) =>
    runTenderPlatformBackfill(reason, () => stopped).catch((error) =>
      logger.error({ err: error, reason }, "Tender platform backfill failed"),
    );
  const arm = () => {
    if (stopped) return;
    const delayMs = millisecondsUntilSaoPauloHour(PLATFORM_BACKFILL_HOUR);
    logger.info({ hour: PLATFORM_BACKFILL_HOUR, delayMs }, "Next tender platform backfill scheduled");
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
