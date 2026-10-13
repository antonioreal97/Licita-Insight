import type { Pool } from "pg";
import { pool, type WorkspaceCutoverMode } from "@workspace/db";
import { logger } from "../lib/logger";
import { pgErrorCode } from "../lib/pg-error";
import { CutoverModeChangedError, type CutoverCaller } from "./cutover-gate";
import { readCutoverState } from "./cutover-state";

/**
 * A job cycle under the cutover flag (docs/contracts/workspace-cutover-v1.md, "Jobs e agendadores"): it reads the
 * state before it starts, does not start while writes are paused, and every gated write must find the mode it read.
 */
export type CutoverCycle = { mode: WorkspaceCutoverMode };

/** A cycle asked to start while writes were paused. Its work stays where it is and is done after the pause. */
export class CutoverPausedError extends Error {
  constructor(readonly operation: string) {
    super(`${operation} does not start while cutover writes are paused`);
    this.name = "CutoverPausedError";
  }
}

/** Rule 1. `null` while writes are paused: the cycle does not start, and says so in the log. */
export async function startCutoverCycle(
  operation: string,
  client: Pick<Pool, "query"> = pool,
): Promise<CutoverCycle | null> {
  const state = await readCutoverState(client);
  if (!state.writesPaused) return { mode: state.mode };
  logger.info({ operation }, "Cycle not started while cutover writes are paused");
  return null;
}

/** Rule 1 for work that cannot be skipped in silence (a queued job, a step of a collection): it raises instead. */
export async function requireCutoverCycle(operation: string): Promise<CutoverCycle> {
  const cycle = await startCutoverCycle(operation);
  if (!cycle) throw new CutoverPausedError(operation);
  return cycle;
}

/** Rule 2: a started cycle may still write during the pause, in the mode it read its inputs in. */
export const cycleCaller = (cycle: CutoverCycle): CutoverCaller => ({ kind: "job", cycleMode: cycle.mode });

/**
 * The cutover got in the way: writes were paused before the cycle started, the mode changed after it read its
 * inputs, or a state change held the lock past the job's `lock_timeout`. Nothing is wrong with the work itself.
 */
export const isCutoverInterruption = (error: unknown): boolean =>
  error instanceof CutoverModeChangedError || error instanceof CutoverPausedError || pgErrorCode(error) === "55P03";

/** Rule 3: the result of an interrupted cycle is dropped with a `warn`; the next cycle redoes it in the current model. */
export function discardedByCutover(error: unknown, operation: string): boolean {
  if (!isCutoverInterruption(error)) return false;
  logger.warn({ err: error, operation }, "Cycle result discarded because of the cutover");
  return true;
}
