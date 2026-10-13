import { sql } from "drizzle-orm";
import { db, type WorkspaceCutoverMode } from "@workspace/db";
import { MaintenanceInProgressError } from "../lib/api-error";
import {
  CUTOVER_STATE_QUERY,
  cutoverStateFromRow,
  type CutoverRow,
  type CutoverState,
} from "./cutover-state";

export type GateTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type GateDatabase = Pick<typeof db, "transaction">;

/**
 * HTTP never waits for the lock and refuses while writes are paused. A job cycle that started before the pause may
 * still write, but only in the mode it read its inputs in (`cycleMode`); new cycles check the pause themselves.
 */
export type CutoverCaller = { kind: "http" } | { kind: "job"; cycleMode: WorkspaceCutoverMode };

const CUTOVER_LOCK_KEY = "licitai:workspace-cutover";

/** The job read its inputs in one model and would write in the other: discard, log `warn`, reschedule. */
export class CutoverModeChangedError extends Error {
  constructor(
    readonly cycleMode: WorkspaceCutoverMode,
    readonly currentMode: WorkspaceCutoverMode,
  ) {
    super(`Workspace cutover mode changed during the job cycle (${cycleMode} -> ${currentMode})`);
    this.name = "CutoverModeChangedError";
  }
}

/**
 * Takes the gate inside a transaction that is already open, for a caller that only finds out along the way that it
 * will write in the scope (the collection, when a changed tender has someone monitoring it). Every scoped read the
 * write depends on must come after this call. The shared lock and the flag read must stay separate statements: in
 * READ COMMITTED each statement takes its own snapshot, so a read in the lock statement could still see the state
 * from before a cutover that just committed.
 */
export async function enterCutoverGate(tx: GateTransaction, caller: CutoverCaller): Promise<CutoverState> {
  if (caller.kind === "job") await tx.execute(sql`set local lock_timeout = '5s'`);
  const lock = await tx.execute<{ acquired: boolean; isolation: string }>(
    caller.kind === "http"
      ? sql`select pg_try_advisory_xact_lock_shared(hashtextextended(${CUTOVER_LOCK_KEY}, 0)) as acquired,
          current_setting('transaction_isolation') as isolation`
      : sql`select true as acquired, current_setting('transaction_isolation') as isolation
          from pg_advisory_xact_lock_shared(hashtextextended(${CUTOVER_LOCK_KEY}, 0))`,
  );
  const isolation = lock.rows[0]?.isolation;
  if (isolation !== "read committed") {
    throw new Error(`withCutoverGate requires READ COMMITTED, got ${isolation ?? "no row"}`);
  }
  if (!lock.rows[0]!.acquired) throw new MaintenanceInProgressError();
  const { rows } = await tx.execute<CutoverRow>(sql.raw(CUTOVER_STATE_QUERY));
  const state = cutoverStateFromRow(rows[0]);
  if (caller.kind === "http" && state.writesPaused) throw new MaintenanceInProgressError();
  if (caller.kind === "job" && state.mode !== caller.cycleMode) {
    throw new CutoverModeChangedError(caller.cycleMode, state.mode);
  }
  return state;
}

/** The single write gate for the workspace scope (docs/contracts/workspace-cutover-v1.md, "Porta de escrita"). */
export async function withCutoverGate<T>(
  caller: CutoverCaller,
  mutation: (tx: GateTransaction, state: CutoverState) => Promise<T>,
  database: GateDatabase = db,
): Promise<T> {
  return database.transaction(async (tx) => mutation(tx, await enterCutoverGate(tx, caller)));
}
