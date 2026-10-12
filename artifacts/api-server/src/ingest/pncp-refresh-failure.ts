import { isRecoverablePncpFailure, PncpError } from "./pncp-client";

export const MAX_CONSECUTIVE_RECOVERABLE_REFRESH_FAILURES = 3;

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
