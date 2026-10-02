import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { incrementMetric, observeMetric } from "../metrics";

export type AiJobKind = "index" | "fit" | "sheet" | "sheet_summary" | "title_rewrite";
export type AiJobLane = "interactive" | "batch";

export type AiJob = {
  id: string;
  kind: AiJobKind;
  dedupeKey: string;
  tenderId: string;
  userId: string | null;
  payload: Record<string, unknown>;
  lane: AiJobLane;
  status: "queued" | "running" | "succeeded" | "failed" | "dead";
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lockedBy: string | null;
  lockedUntil: Date | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

type DatabaseRow = {
  id: string;
  kind: AiJobKind;
  dedupe_key: string;
  tender_id: string;
  user_id: string | null;
  payload: Record<string, unknown>;
  lane: AiJobLane;
  status: AiJob["status"];
  attempts: number;
  max_attempts: number;
  run_after: Date;
  locked_by: string | null;
  locked_until: Date | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
};

const jobFromRow = (row: DatabaseRow): AiJob => ({
  id: row.id,
  kind: row.kind,
  dedupeKey: row.dedupe_key,
  tenderId: row.tender_id,
  userId: row.user_id,
  payload: row.payload,
  lane: row.lane,
  status: row.status,
  attempts: row.attempts,
  maxAttempts: row.max_attempts,
  runAfter: row.run_after,
  lockedBy: row.locked_by,
  lockedUntil: row.locked_until,
  createdAt: row.created_at,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

const positiveInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

export const aiJobQueueConfig = () => ({
  pollMs: positiveInteger("AI_JOB_POLL_MS", 1_000),
  visibilityMs: positiveInteger("AI_JOB_VISIBILITY_TIMEOUT_MS", 5 * 60_000),
  maxDepth: {
    index: positiveInteger("AI_QUEUE_MAX_DEPTH_INDEX", 1_000),
    fit: positiveInteger("AI_QUEUE_MAX_DEPTH_FIT", 10_000),
    sheet: positiveInteger("AI_QUEUE_MAX_DEPTH_SHEET", 1_000),
    sheet_summary: positiveInteger("AI_QUEUE_MAX_DEPTH_SHEET", 1_000),
    title_rewrite: positiveInteger("AI_QUEUE_MAX_DEPTH_TITLE_REWRITE", 2_000),
  } satisfies Record<AiJobKind, number>,
  concurrency: {
    index: positiveInteger("WORKER_INDEX_CONCURRENCY", 2),
    fit: positiveInteger("WORKER_FIT_CONCURRENCY", 8),
    sheet: positiveInteger("WORKER_SHEET_CONCURRENCY", 2),
    sheet_summary: positiveInteger("WORKER_SHEET_CONCURRENCY", 2),
    // Claimed in batches of ten, one batch per teacher provider at a time.
    title_rewrite: 1,
  } satisfies Record<AiJobKind, number>,
  indexPerUserPerHour: positiveInteger("AI_INDEX_ENQUEUE_PER_USER_PER_HOUR", 60),
});

export type EnqueueAiJobInput = {
  kind: AiJobKind;
  dedupeKey: string;
  tenderId: string;
  userId?: string | null;
  payload: Record<string, unknown>;
  lane: AiJobLane;
  enforceIndexUserRate?: boolean;
  maxAttempts?: number;
};

export type EnqueueAiJobResult = {
  enqueued: boolean;
  reason: "created" | "deduplicated" | "queue_full" | "user_rate_limited";
  jobId: string | null;
};

export async function enqueueAiJob(input: EnqueueAiJobInput): Promise<EnqueueAiJobResult> {
  const config = aiJobQueueConfig();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`licitai:ai-queue:${input.kind}`]);
    const existing = await client.query<{ id: string }>("select id from ai_jobs where dedupe_key = $1", [input.dedupeKey]);
    if (existing.rows[0]) {
      await client.query("commit");
      return { enqueued: false, reason: "deduplicated", jobId: existing.rows[0].id };
    }
    if (input.enforceIndexUserRate && input.kind === "index" && input.userId) {
      const recent = await client.query<{ count: string }>(
        `select count(*)::text as count from ai_jobs
         where kind = 'index' and user_id = $1 and created_at >= now() - interval '1 hour'`,
        [input.userId],
      );
      if (Number(recent.rows[0]?.count ?? 0) >= config.indexPerUserPerHour) {
        await client.query("commit");
        incrementMetric("licitai_ai_job_enqueue_rejected_total", { kind: input.kind, reason: "user_rate_limited" });
        return { enqueued: false, reason: "user_rate_limited", jobId: null };
      }
    }
    const depth = await client.query<{ count: string }>(
      "select count(*)::text as count from ai_jobs where kind = $1 and status in ('queued', 'running')",
      [input.kind],
    );
    if (Number(depth.rows[0]?.count ?? 0) >= config.maxDepth[input.kind]) {
      await client.query("commit");
      incrementMetric("licitai_ai_job_enqueue_rejected_total", { kind: input.kind, reason: "queue_full" });
      return { enqueued: false, reason: "queue_full", jobId: null };
    }
    const id = randomUUID();
    await client.query(
      `insert into ai_jobs
       (id, kind, dedupe_key, tender_id, user_id, payload, lane, max_attempts)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [id, input.kind, input.dedupeKey, input.tenderId, input.userId ?? null,
        JSON.stringify(input.payload), input.lane, input.maxAttempts ?? 6],
    );
    await client.query("select pg_notify('ai_jobs', $1)", [input.kind]);
    await client.query("commit");
    return { enqueued: true, reason: "created", jobId: id };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function claimAiJobs(
  kinds: AiJobKind[],
  limit: number,
  workerId: string,
  visibilityMs = aiJobQueueConfig().visibilityMs,
  filter: { titleProvider?: "ollama" | "openai" } = {},
): Promise<AiJob[]> {
  if (kinds.length === 0 || limit < 1) return [];
  const result = await pool.query<DatabaseRow>(
    `with candidates as (
       select id from ai_jobs
       where status = 'queued' and run_after <= now() and kind = any($1::text[])
         and ($5::text is null or coalesce(payload->>'provider', 'ollama') = $5::text)
       order by case lane when 'interactive' then 0 else 1 end, created_at, id
       for update skip locked
       limit $2
     )
     update ai_jobs j set
       status = 'running', attempts = attempts + 1, locked_by = $3,
       locked_until = now() + ($4::bigint * interval '1 millisecond'),
       started_at = coalesce(started_at, now()), finished_at = null
     from candidates where j.id = candidates.id
     returning j.*`,
    [kinds, limit, workerId, visibilityMs, filter.titleProvider ?? null],
  );
  return result.rows.map(jobFromRow);
}

export async function recoverExpiredAiJobs(): Promise<{ requeued: number; dead: number }> {
  const dead = await pool.query(
    `update ai_jobs set status = 'dead', locked_by = null, locked_until = null,
       last_error = coalesce(last_error, 'visibility timeout expired'), finished_at = now()
     where status = 'running' and locked_until < now() and attempts >= max_attempts returning id`,
  );
  const requeued = await pool.query(
    `update ai_jobs set status = 'queued', locked_by = null, locked_until = null,
       last_error = coalesce(last_error, 'visibility timeout expired'),
       run_after = now() + (least(300, power(2, greatest(attempts - 1, 0))) * interval '1 second')
     where status = 'running' and locked_until < now() and attempts < max_attempts returning id`,
  );
  return { requeued: requeued.rowCount ?? 0, dead: dead.rowCount ?? 0 };
}

const completeAiJob = async (job: AiJob): Promise<void> => {
  await pool.query(
    `update ai_jobs set status = 'succeeded', locked_by = null, locked_until = null,
       last_error = null, finished_at = now() where id = $1 and locked_by = $2`,
    [job.id, job.lockedBy],
  );
};

const failAiJob = async (job: AiJob, error: unknown): Promise<void> => {
  const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 4_000);
  const terminal = job.attempts >= job.maxAttempts;
  await pool.query(
    `update ai_jobs set status = $3, locked_by = null, locked_until = null,
       last_error = $4, finished_at = case when $3 = 'dead' then now() else null end,
       run_after = case when $3 = 'queued'
         then now() + (least(300, power(2, greatest(attempts - 1, 0))) * interval '1 second')
         else run_after end
     where id = $1 and locked_by = $2`,
    [job.id, job.lockedBy, terminal ? "dead" : "queued", message],
  );
};

export async function executeAiJob(job: AiJob): Promise<void> {
  if (job.kind === "index") {
    const { executeTenderIndexJob } = await import("./tender-index-service");
    await executeTenderIndexJob(job.tenderId, Number(job.payload.version), Number(job.payload.previousVersion));
    return;
  }
  if (job.kind === "fit") {
    const { executeCompanyFitJob } = await import("./company-fit-service");
    await executeCompanyFitJob(String(job.payload.fitId));
    return;
  }
  if (job.kind === "title_rewrite") {
    const titles = await import("../titles/title-rewrite");
    await titles.executeTitleRewriteJob(job.tenderId, titles.teacherBackendFor(titles.titleRewriteProvider(job.payload)));
    return;
  }
  if (job.kind === "sheet_summary") {
    const { executeTenderSheetSummaryJob } = await import("./tender-sheet-service");
    await executeTenderSheetSummaryJob(
      String(job.payload.sheetId),
      job.tenderId,
      String(job.payload.model),
      Number(job.payload.promptVersion),
    );
    return;
  }
  const { executeTenderSheetJob } = await import("./tender-sheet-service");
  await executeTenderSheetJob(String(job.payload.sheetId), job.tenderId);
}

export async function runEnqueuedAiJobNow(dedupeKey: string): Promise<boolean> {
  const workerId = `licitai-all:${hostname()}:${process.pid}`;
  const config = aiJobQueueConfig();
  const result = await pool.query<DatabaseRow>(
    `update ai_jobs set status = 'running', attempts = attempts + 1, locked_by = $2,
       locked_until = now() + ($3::bigint * interval '1 millisecond'),
       started_at = coalesce(started_at, now())
     where dedupe_key = $1 and status = 'queued' and run_after <= now()
     returning *`,
    [dedupeKey, workerId, config.visibilityMs],
  );
  const row = result.rows[0];
  if (!row) return false;
  const job = jobFromRow(row);
  try {
    await executeAiJob(job);
    await completeAiJob(job);
  } catch (error) {
    await failAiJob(job, error);
  }
  return true;
}

type TitleProvider = "ollama" | "openai";
type TitleBatchExecutor = (provider: TitleProvider, jobs: AiJob[]) => Promise<(unknown | Error)[]>;

const executeTitleBatch: TitleBatchExecutor = async (provider, jobs) => {
  const titles = await import("../titles/title-rewrite");
  return await titles.executeTitleRewriteBatch(jobs.map(({ tenderId }) => tenderId), titles.teacherBackendFor(provider));
};

export function startAiJobWorker(options: {
  workerId?: string;
  executor?: (job: AiJob) => Promise<void>;
  titleBatchExecutor?: TitleBatchExecutor;
} = {}): () => void {
  const config = aiJobQueueConfig();
  const workerId = options.workerId ?? `${process.env.DB_APPLICATION_NAME?.trim() || "licitai-worker"}:${hostname()}:${process.pid}`;
  const executor = options.executor ?? executeAiJob;
  const titleBatchExecutor = options.titleBatchExecutor ?? executeTitleBatch;
  const titleBatchRunning: Record<TitleProvider, boolean> = { ollama: false, openai: false };
  let stopped = false;
  let recovering = false;
  const active = new Set<Promise<void>>();
  const activeByKind: Record<AiJobKind, number> = {
    index: 0,
    fit: 0,
    sheet: 0,
    sheet_summary: 0,
    title_rewrite: 0,
  };

  const handle = (job: AiJob): void => {
    observeMetric("licitai_ai_job_queue_wait_seconds", Math.max(0, (Date.now() - job.createdAt.getTime()) / 1_000), {
      kind: job.kind, lane: job.lane,
    });
    activeByKind[job.kind] += 1;
    const heartbeat = setInterval(() => {
      void pool.query(
        `update ai_jobs set locked_until = now() + ($3::bigint * interval '1 millisecond')
         where id = $1 and locked_by = $2 and status = 'running'`,
        [job.id, workerId, config.visibilityMs],
      );
    }, Math.max(1_000, Math.floor(config.visibilityMs / 3)));
    heartbeat.unref();
    const task = executor(job)
      .then(() => completeAiJob(job))
      .catch(async (error) => {
        await failAiJob(job, error);
        logger.warn({ err: error, jobId: job.id, kind: job.kind, attempts: job.attempts }, "AI job failed");
      })
      .finally(() => {
        clearInterval(heartbeat);
        activeByKind[job.kind] -= 1;
        active.delete(task);
      });
    active.add(task);
  };

  // One teacher call covers up to ten title_rewrite jobs of the same provider.
  const handleTitleBatch = (provider: TitleProvider, jobs: AiJob[]): void => {
    titleBatchRunning[provider] = true;
    activeByKind.title_rewrite += jobs.length;
    const ids = jobs.map(({ id }) => id);
    const heartbeat = setInterval(() => {
      void pool.query(
        `update ai_jobs set locked_until = now() + ($3::bigint * interval '1 millisecond')
         where id = any($1::text[]) and locked_by = $2 and status = 'running'`,
        [ids, workerId, config.visibilityMs],
      );
    }, Math.max(1_000, Math.floor(config.visibilityMs / 3)));
    heartbeat.unref();
    const task = titleBatchExecutor(provider, jobs)
      .then(async (outcomes) => {
        for (const [index, job] of jobs.entries()) {
          const outcome = outcomes[index];
          if (outcome instanceof Error) {
            await failAiJob(job, outcome);
            logger.warn({ err: outcome, jobId: job.id, kind: job.kind, attempts: job.attempts }, "AI job failed");
          } else {
            await completeAiJob(job);
          }
        }
      })
      .catch(async (error) => {
        for (const job of jobs) await failAiJob(job, error);
        logger.warn({ err: error, provider, jobs: jobs.length }, "Title rewrite batch failed");
      })
      .finally(() => {
        clearInterval(heartbeat);
        titleBatchRunning[provider] = false;
        activeByKind.title_rewrite -= jobs.length;
        active.delete(task);
      });
    active.add(task);
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    if (!recovering) {
      recovering = true;
      void recoverExpiredAiJobs().catch((error) => logger.error({ err: error }, "AI job recovery failed")).finally(() => {
        recovering = false;
      });
    }
    const { isAiBatchBudgetPaused } = await import("./ai-budget");
    const budgetPaused = await isAiBatchBudgetPaused();
    for (const kind of ["index", "sheet", "sheet_summary", "fit"] as const) {
      if (kind === "fit" && budgetPaused) continue;
      const available = config.concurrency[kind] - activeByKind[kind];
      if (available < 1) continue;
      const claimed = await claimAiJobs([kind], available, workerId);
      claimed.forEach(handle);
    }
    const { titleRewriteProviderEnabled } = await import("../titles/title-rewrite");
    const { TEACHER_BATCH_SIZE } = await import("../titles/teacher");
    for (const provider of ["ollama", "openai"] as const) {
      if (titleBatchRunning[provider] || !titleRewriteProviderEnabled(provider)) continue;
      // The paid teacher stops with the daily AI budget; the local one costs nothing.
      if (provider === "openai" && budgetPaused) continue;
      const claimed = await claimAiJobs(["title_rewrite"], TEACHER_BATCH_SIZE, workerId, undefined, { titleProvider: provider });
      if (claimed.length > 0) handleTitleBatch(provider, claimed);
    }
  };
  void tick().catch((error) => logger.error({ err: error }, "AI job worker tick failed"));
  const timer = setInterval(() => void tick().catch((error) => logger.error({ err: error }, "AI job worker tick failed")), config.pollMs);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
