import { isRecoverablePncpFailure, PncpError } from "./pncp-client";

export const MAX_CONSECUTIVE_RECOVERABLE_REFRESH_FAILURES = 3;

export const pncpRefreshMaxConsecutiveFailuresFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): number => {
  const raw = env.PNCP_REFRESH_MAX_CONSECUTIVE_FAILURES;
  if (raw === undefined || raw.trim() === "")
    return MAX_CONSECUTIVE_RECOVERABLE_REFRESH_FAILURES;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `PNCP_REFRESH_MAX_CONSECUTIVE_FAILURES must be a positive integer, received "${raw}"`,
    );
  }
  return parsed;
};

export const classifyPncpRefreshFailure = (
  error: unknown,
): "source_removed" | "error" =>
  error instanceof PncpError && error.status === 410
    ? "source_removed"
    : "error";

export type PncpRefreshAttemptOutcome = "updated" | "failed";

export type PncpRefreshQueueCounters = {
  updated: number;
  failed: number;
  unattempted: number;
  stoppedAfterConsecutiveRecoverableFailures: boolean;
};

type PncpRefreshQueueDeps<T> = {
  attempt: (candidate: T) => Promise<PncpRefreshAttemptOutcome>;
  maxConsecutiveRecoverableFailures: number;
  onAttemptError?: (error: unknown, candidate: T) => void | Promise<void>;
  onSourceRemoved?: (error: unknown, candidate: T) => void | Promise<void>;
  onProgress?: (counters: PncpRefreshQueueCounters) => void;
  onCircuitOpen?: (
    counters: PncpRefreshQueueCounters,
    consecutiveRecoverableFailures: number,
  ) => void;
};

const snapshot = (
  counters: PncpRefreshQueueCounters,
): PncpRefreshQueueCounters => ({ ...counters });

export async function refreshPncpCandidates<T>(
  candidates: T[],
  deps: PncpRefreshQueueDeps<T>,
): Promise<PncpRefreshQueueCounters> {
  const counters: PncpRefreshQueueCounters = {
    updated: 0,
    failed: 0,
    unattempted: candidates.length,
    stoppedAfterConsecutiveRecoverableFailures: false,
  };
  let consecutiveRecoverableFailures = 0;

  for (const candidate of candidates) {
    counters.unattempted -= 1;
    try {
      const outcome = await deps.attempt(candidate);
      if (outcome === "updated") counters.updated += 1;
      else counters.failed += 1;
      consecutiveRecoverableFailures = 0;
    } catch (error) {
      if (classifyPncpRefreshFailure(error) === "source_removed") {
        await deps.onSourceRemoved?.(error, candidate);
        consecutiveRecoverableFailures = 0;
        deps.onProgress?.(snapshot(counters));
        continue;
      }

      counters.failed += 1;
      await deps.onAttemptError?.(error, candidate);
      if (isRecoverablePncpFailure(error)) {
        consecutiveRecoverableFailures += 1;
      } else {
        consecutiveRecoverableFailures = 0;
      }
    }

    deps.onProgress?.(snapshot(counters));
    if (
      consecutiveRecoverableFailures >= deps.maxConsecutiveRecoverableFailures
    ) {
      counters.stoppedAfterConsecutiveRecoverableFailures = true;
      deps.onCircuitOpen?.(snapshot(counters), consecutiveRecoverableFailures);
      break;
    }
  }

  return counters;
}

export type PncpRefreshWithEnrichmentCounters = PncpRefreshQueueCounters & {
  enriched: number;
  enrichmentFailed: number;
  enrichmentSkipped: number;
  enrichmentCircuitOpen: boolean;
};

type PncpRefreshWithEnrichmentDeps<T> = PncpRefreshQueueDeps<T> & {
  enrich: (candidate: T) => Promise<void>;
  onEnrichmentError?: (error: unknown, candidate: T) => void | Promise<void>;
  onEnrichmentCircuitOpen?: (
    counters: PncpRefreshWithEnrichmentCounters,
    consecutiveRecoverableFailures: number,
  ) => void;
  onCombinedProgress?: (counters: PncpRefreshWithEnrichmentCounters) => void;
};

const combinedSnapshot = (
  counters: PncpRefreshWithEnrichmentCounters,
): PncpRefreshWithEnrichmentCounters => ({ ...counters });

/**
 * Refreshes the purchase through the consultation API first, then enriches its
 * details while that independent circuit is closed. A detail outage never
 * changes a successful purchase refresh into a failed one.
 */
export async function refreshPncpCandidatesWithEnrichment<T>(
  candidates: T[],
  deps: PncpRefreshWithEnrichmentDeps<T>,
): Promise<PncpRefreshWithEnrichmentCounters> {
  const counters: PncpRefreshWithEnrichmentCounters = {
    updated: 0,
    failed: 0,
    unattempted: candidates.length,
    stoppedAfterConsecutiveRecoverableFailures: false,
    enriched: 0,
    enrichmentFailed: 0,
    enrichmentSkipped: 0,
    enrichmentCircuitOpen: false,
  };
  let consecutiveRefreshFailures = 0;
  let consecutiveEnrichmentFailures = 0;

  for (const candidate of candidates) {
    counters.unattempted -= 1;
    let updated = false;
    try {
      const outcome = await deps.attempt(candidate);
      if (outcome === "updated") {
        counters.updated += 1;
        updated = true;
      } else {
        counters.failed += 1;
      }
      consecutiveRefreshFailures = 0;
    } catch (error) {
      if (classifyPncpRefreshFailure(error) === "source_removed") {
        await deps.onSourceRemoved?.(error, candidate);
        consecutiveRefreshFailures = 0;
      } else {
        counters.failed += 1;
        await deps.onAttemptError?.(error, candidate);
        consecutiveRefreshFailures = isRecoverablePncpFailure(error)
          ? consecutiveRefreshFailures + 1
          : 0;
      }
    }

    if (updated) {
      if (counters.enrichmentCircuitOpen) {
        counters.enrichmentSkipped += 1;
      } else {
        try {
          await deps.enrich(candidate);
          counters.enriched += 1;
          consecutiveEnrichmentFailures = 0;
        } catch (error) {
          counters.enrichmentFailed += 1;
          await deps.onEnrichmentError?.(error, candidate);
          consecutiveEnrichmentFailures = isRecoverablePncpFailure(error)
            ? consecutiveEnrichmentFailures + 1
            : 0;
          if (
            consecutiveEnrichmentFailures >=
            deps.maxConsecutiveRecoverableFailures
          ) {
            counters.enrichmentCircuitOpen = true;
            deps.onEnrichmentCircuitOpen?.(
              combinedSnapshot(counters),
              consecutiveEnrichmentFailures,
            );
          }
        }
      }
    }

    deps.onProgress?.(combinedSnapshot(counters));
    deps.onCombinedProgress?.(combinedSnapshot(counters));
    if (consecutiveRefreshFailures >= deps.maxConsecutiveRecoverableFailures) {
      counters.stoppedAfterConsecutiveRecoverableFailures = true;
      deps.onCircuitOpen?.(
        combinedSnapshot(counters),
        consecutiveRefreshFailures,
      );
      break;
    }
  }

  return counters;
}
