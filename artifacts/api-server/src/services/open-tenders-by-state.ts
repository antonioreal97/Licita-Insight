import {
  GetOpenTendersByStateResponse,
  type OpenTendersByState,
  type OpenTendersByStateResponse,
} from "@workspace/api-zod";
import { PNCP_UFS } from "../ingest/pncp-client";
import { createTimedCache, type TimedCache } from "../lib/timed-cache";

export const OPEN_TENDERS_BY_STATE_TTL_MS = 15 * 60_000;
const RETRY_AFTER_FAILURE_MS = 60_000;

export type OpenTendersStateRow = {
  state: string;
  openTenders: number;
  estimatedValueTotal: number | null;
  updatedAt: Date | null;
};

const latest = (a: Date | null, b: Date | null): Date | null => (a && b ? (a > b ? a : b) : (a ?? b));

/**
 * Always the 27 states, in code order. The column is free text from the source: codes are trimmed and upper-cased,
 * rows that differ only by that are added together, and anything that is not a state is left out.
 */
export const toOpenTendersByState = (rows: readonly OpenTendersStateRow[], generatedAt: Date): OpenTendersByStateResponse => {
  const byState = new Map<string, OpenTendersByState>(
    PNCP_UFS.map((state) => [state, { state, openTenders: 0, estimatedValueTotal: null, updatedAt: null }]),
  );
  for (const row of rows) {
    const entry = byState.get(row.state.trim().toUpperCase());
    if (!entry) continue;
    entry.openTenders += row.openTenders;
    if (row.estimatedValueTotal !== null) entry.estimatedValueTotal = (entry.estimatedValueTotal ?? 0) + row.estimatedValueTotal;
    entry.updatedAt = latest(entry.updatedAt, row.updatedAt);
  }
  const data = [...byState.values()];
  return {
    data,
    meta: {
      totalOpenTenders: data.reduce((total, entry) => total + entry.openTenders, 0),
      generatedAt,
      indexUpdatedAt: data.reduce<Date | null>((newest, entry) => latest(newest, entry.updatedAt), null),
      cacheTtlSeconds: OPEN_TENDERS_BY_STATE_TTL_MS / 1000,
    },
  };
};

export const createOpenTendersByStateCache = (
  selectRows: () => Promise<OpenTendersStateRow[]>,
  now: () => number = Date.now,
): TimedCache<OpenTendersByStateResponse> =>
  createTimedCache(
    async () => GetOpenTendersByStateResponse.parse(toOpenTendersByState(await selectRows(), new Date(now()))),
    { ttlMs: OPEN_TENDERS_BY_STATE_TTL_MS, retryMs: RETRY_AFTER_FAILURE_MS, now },
  );

let cache: TimedCache<OpenTendersByStateResponse> | undefined;

/** The public landing page reads this: the database is asked at most once per 15 minutes, whatever the traffic. */
export const getOpenTendersByState = (): Promise<OpenTendersByStateResponse> => {
  cache ??= createOpenTendersByStateCache(async () => {
    const { selectOpenTendersByState } = await import("../repositories/postgres-open-tenders-by-state");
    return selectOpenTendersByState();
  });
  return cache.get();
};
