import { hostname } from "node:os";
import { logger } from "../lib/logger";

type QueryResult<Row = Record<string, unknown>> = { rows: Row[] };
type LockClient = {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  release(): void;
};
type LockPool = { connect(): Promise<LockClient> };

export type SingletonJobResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

const workerId = (): string =>
  `${process.env.DB_APPLICATION_NAME?.trim() || "licitai-worker"}:${hostname()}:${process.pid}`;

export async function recordSkippedJobRun(
  jobKey: string,
  status: "skipped_budget",
): Promise<void> {
  const { pool } = await import("@workspace/db");
  await pool.query(
    `insert into job_run_audit (job_key, status, worker_id, duration_ms, finished_at)
     values ($1, $2, $3, 0, now())`,
    [jobKey, status, workerId()],
  );
}

const errorText = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 4_000) : String(error).slice(0, 4_000);

export const tryRunSingletonJob = async <T>(
  jobKey: string,
  job: () => Promise<T>,
  options: { lockPool?: LockPool; workerId?: string } = {},
): Promise<SingletonJobResult<T>> => {
  const lockPool = options.lockPool ?? ((await import("@workspace/db")).pool as unknown as LockPool);
  const client = await lockPool.connect();
  const owner = options.workerId ?? workerId();
  const startedAt = Date.now();
  let locked = false;
  let auditId: number | undefined;
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired",
      [`licitai:job:${jobKey}`],
    );
    locked = lock.rows[0]?.acquired === true;
    if (!locked) {
      await client.query(
        `insert into job_run_audit (job_key, status, worker_id, duration_ms, finished_at)
         values ($1, 'skipped_locked', $2, $3, now())`,
        [jobKey, owner, Date.now() - startedAt],
      );
      logger.debug({ jobKey }, "Job cycle skipped because another worker holds the lock");
      return { acquired: false };
    }
    const inserted = await client.query<{ id: number }>(
      `insert into job_run_audit (job_key, status, worker_id)
       values ($1, 'running', $2) returning id`,
      [jobKey, owner],
    );
    auditId = inserted.rows[0]?.id;
    const value = await job();
    await client.query(
      `update job_run_audit
       set status = 'succeeded', duration_ms = $2, finished_at = now()
       where id = $1`,
      [auditId, Date.now() - startedAt],
    );
    return { acquired: true, value };
  } catch (error) {
    if (auditId !== undefined) {
      try {
        await client.query(
          `update job_run_audit
           set status = 'failed', duration_ms = $2, error = $3, finished_at = now()
           where id = $1`,
          [auditId, Date.now() - startedAt, errorText(error)],
        );
      } catch (auditError) {
        logger.error({ err: auditError, jobKey }, "Failed to audit a job failure");
      }
    }
    throw error;
  } finally {
    if (locked) {
      try {
        await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [
          `licitai:job:${jobKey}`,
        ]);
      } catch (unlockError) {
        logger.error({ err: unlockError, jobKey }, "Failed to release job advisory lock");
      }
    }
    client.release();
  }
};
