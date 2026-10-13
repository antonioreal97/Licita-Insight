import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { logger } from "../lib/logger";
import type { GateTransaction } from "../workspaces/cutover-gate";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { incrementMetric, observeMetric } from "../metrics";

export type AiJobKind = "index" | "document_ocr" | "fit" | "sheet" | "sheet_summary" | "title_rewrite";
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
    document_ocr: positiveInteger("AI_QUEUE_MAX_DEPTH_DOCUMENT_OCR", 1_000),
    fit: positiveInteger("AI_QUEUE_MAX_DEPTH_FIT", 10_000),
    sheet: positiveInteger("AI_QUEUE_MAX_DEPTH_SHEET", 1_000),
    sheet_summary: positiveInteger("AI_QUEUE_MAX_DEPTH_SHEET", 1_000),
    title_rewrite: positiveInteger("AI_QUEUE_MAX_DEPTH_TITLE_REWRITE", 2_000),
  } satisfies Record<AiJobKind, number>,
  concurrency: {
    index: positiveInteger("WORKER_INDEX_CONCURRENCY", 2),
    document_ocr: 1,
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
  /** Durable producer-owned queues (currently the paid title teacher) must never drop overflow. */
  ignoreQueueDepth?: boolean;
  /** `fit` jobs written in `workspaces` mode; the dedupe key keeps the legacy string until W4. */
  workspaceId?: string | null;
};

export type EnqueueAiJobResult = {
  enqueued: boolean;
  reason: "created" | "deduplicated" | "queue_full" | "user_rate_limited";
  jobId: string | null;
};

/**
 * Runs in its own transaction, or inside `tx` when the caller must enqueue in the same transaction as its write (the
 * `fit` job behind the workspace cutover gate). Inside a gated transaction it must not take a second pool connection.
 */
export async function enqueueAiJob(input: EnqueueAiJobInput, tx?: GateTransaction): Promise<EnqueueAiJobResult> {
  if (!tx) return db.transaction((own) => enqueueAiJob(input, own));
  const config = aiJobQueueConfig();
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`licitai:ai-queue:${input.kind}`}, 0))`);
  const existing = await tx.execute<{ id: string }>(sql`select id from ai_jobs where dedupe_key = ${input.dedupeKey}`);
  if (existing.rows[0]) return { enqueued: false, reason: "deduplicated", jobId: existing.rows[0].id };
  if (input.enforceIndexUserRate && input.kind === "index" && input.userId) {
    const recent = await tx.execute<{ count: string }>(
      sql`select count(*)::text as count from ai_jobs
       where kind = 'index' and user_id = ${input.userId} and created_at >= now() - interval '1 hour'`,
    );
    if (Number(recent.rows[0]?.count ?? 0) >= config.indexPerUserPerHour) {
      incrementMetric("licitai_ai_job_enqueue_rejected_total", { kind: input.kind, reason: "user_rate_limited" });
      return { enqueued: false, reason: "user_rate_limited", jobId: null };
    }
  }
  if (!input.ignoreQueueDepth) {
    const depth = await tx.execute<{ count: string }>(
      sql`select count(*)::text as count from ai_jobs where kind = ${input.kind} and status in ('queued', 'running')`,
    );
    if (Number(depth.rows[0]?.count ?? 0) >= config.maxDepth[input.kind]) {
      incrementMetric("licitai_ai_job_enqueue_rejected_total", { kind: input.kind, reason: "queue_full" });
      return { enqueued: false, reason: "queue_full", jobId: null };
    }
  }
  const id = randomUUID();
  await tx.execute(
    sql`insert into ai_jobs
     (id, kind, dedupe_key, tender_id, user_id, payload, lane, max_attempts, workspace_id)
     values (${id}, ${input.kind}, ${input.dedupeKey}, ${input.tenderId}, ${input.userId ?? null},
       ${JSON.stringify(input.payload)}::jsonb, ${input.lane}, ${input.maxAttempts ?? 6}, ${input.workspaceId ?? null})`,
  );
  await tx.execute(sql`select pg_notify('ai_jobs', ${input.kind})`);
  return { enqueued: true, reason: "created", jobId: id };
}

const TITLE_PRIORITY_ORDER = `
  case when t.status = 'open' then 0 else 1 end,
  case when t.status = 'open' then t.proposal_deadline end asc nulls last,
  t.published_at asc nulls last,
  j.created_at,
  j.id`;

/** Remaining daily tender slots. Jobs already assigned to today keep their retry slot. */
export async function openAiTitleDailyCapacity(dailyLimit: number, now = new Date()): Promise<number> {
  const quotaDay = dateInSaoPaulo(now);
  const used = (await pool.query<{ count: number }>(
    `select count(*)::int as count from ai_jobs
     where kind = 'title_rewrite' and payload->>'provider' = 'openai'
       and payload->>'titleQuotaDay' = $1`,
    [quotaDay],
  )).rows[0]?.count ?? 0;
  return Math.max(0, dailyLimit - used);
}

/**
 * Claims paid title jobs under one DB lock so multiple workers cannot overshoot the
 * daily tender cap. Ordering favors live deadlines, then publication FIFO.
 */
export async function claimTitleRewriteJobs(
  provider: TitleProvider,
  limit: number,
  workerId: string,
  visibilityMs = aiJobQueueConfig().visibilityMs,
  dailyLimit = Number.MAX_SAFE_INTEGER,
  now = new Date(),
): Promise<AiJob[]> {
  if (provider === "ollama") {
    return claimAiJobs(["title_rewrite"], limit, workerId, visibilityMs, { titleProvider: provider });
  }
  if (limit < 1 || dailyLimit < 1) return [];
  const quotaDay = dateInSaoPaulo(now);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", ["licitai:title-openai-daily"]);
    const used = Number((await client.query<{ count: string }>(
      `select count(*)::text as count from ai_jobs
       where kind = 'title_rewrite' and payload->>'provider' = 'openai'
         and payload->>'titleQuotaDay' = $1`,
      [quotaDay],
    )).rows[0]?.count ?? 0);

    const claim = async (sameDay: boolean, take: number): Promise<DatabaseRow[]> => {
      if (take < 1) return [];
      const result = await client.query<DatabaseRow>(
        `with candidates as (
           select j.id from ai_jobs j join tenders t on t.id = j.tender_id
           where j.status = 'queued' and j.run_after <= now() and j.kind = 'title_rewrite'
             and j.payload->>'provider' = 'openai'
             and ${sameDay ? "j.payload->>'titleQuotaDay' = $4" : "j.payload->>'titleQuotaDay' is distinct from $4"}
           order by ${TITLE_PRIORITY_ORDER}
           for update of j skip locked
           limit $1
         )
         update ai_jobs j set status = 'running', attempts = attempts + 1, locked_by = $2,
           locked_until = now() + ($3::bigint * interval '1 millisecond'),
           started_at = now(), finished_at = null,
           payload = jsonb_set(j.payload, '{titleQuotaDay}', to_jsonb($4::text), true)
         from candidates where j.id = candidates.id returning j.*`,
        [take, workerId, visibilityMs, quotaDay],
      );
      return result.rows;
    };

    const retriedToday = await claim(true, limit);
    const capacity = Math.max(0, dailyLimit - used);
    const fresh = await claim(false, Math.min(limit - retriedToday.length, capacity));
    await client.query("commit");
    return [...retriedToday, ...fresh].map(jobFromRow);
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
  const dead = await pool.query<{ kind: AiJobKind; payload: Record<string, unknown> }>(
    `update ai_jobs set status = 'dead', locked_by = null, locked_until = null,
       last_error = coalesce(last_error, 'visibility timeout expired'), finished_at = now()
     where status = 'running' and locked_until < now() and attempts >= max_attempts returning kind, payload`,
  );
  const requeued = await pool.query(
    `update ai_jobs set status = 'queued', locked_by = null, locked_until = null,
       last_error = coalesce(last_error, 'visibility timeout expired'),
       run_after = now() + (least(300, power(2, greatest(attempts - 1, 0))) * interval '1 second')
     where status = 'running' and locked_until < now() and attempts < max_attempts returning id`,
  );
  for (const job of dead.rows) {
    if (job.kind !== "document_ocr") continue;
    const { markDocumentOcrFailed } = await import("./tender-index-service");
    await markDocumentOcrFailed(String(job.payload.documentId), new Error("OCR visibility timeout expired"));
  }
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
  if (terminal && job.kind === "document_ocr") {
    const { markDocumentOcrFailed } = await import("./tender-index-service");
    await markDocumentOcrFailed(String(job.payload.documentId), error);
  }
};

export async function executeAiJob(job: AiJob): Promise<void> {
  if (job.kind === "index") {
    const { executeTenderIndexJob } = await import("./tender-index-service");
    await executeTenderIndexJob(job.tenderId, Number(job.payload.version), Number(job.payload.previousVersion));
    return;
  }
  if (job.kind === "document_ocr") {
    const { executeDocumentOcrJob } = await import("./tender-index-service");
    await executeDocumentOcrJob(job.tenderId, String(job.payload.documentId), Number(job.payload.indexVersion));
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
  let nextTitleBackfillAt = 0;
  const active = new Set<Promise<void>>();
  const activeByKind: Record<AiJobKind, number> = {
    index: 0,
    document_ocr: 0,
    fit: 0,
    sheet: 0,
    sheet_summary: 0,
    title_rewrite: 0,
  };

  const maybeEnqueueTitleBackfill = async (): Promise<void> => {
    const now = new Date();
    if (now.getTime() < nextTitleBackfillAt) return;
    const { enqueueTitleBackfillBatch, titleBackfillAllowedAt, titleBackfillConfig } = await import("../titles/title-backfill");
    const backfill = titleBackfillConfig();
    nextTitleBackfillAt = now.getTime() + backfill.intervalMs;
    if (!backfill.enabled || !titleBackfillAllowedAt(now)) return;
    const { titleRewriteDailyLimit } = await import("../titles/title-rewrite");
    const capacity = await openAiTitleDailyCapacity(titleRewriteDailyLimit("openai"), now);
    if (capacity < 1) return;
    const result = await enqueueTitleBackfillBatch({ dailyCapacity: capacity, batchSize: backfill.batchSize });
    if (result.created > 0) logger.info(result, "OpenAI title backfill batch enqueued");
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
        if (provider === "openai") {
          const { refreshTitleBudgetState } = await import("./ai-budget");
          await refreshTitleBudgetState(true).catch((error) => {
            logger.warn({ err: error }, "Failed to refresh OpenAI title teacher budget after batch");
          });
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
    const { isAiBatchBudgetPaused, isTitleTeacherBudgetPaused } = await import("./ai-budget");
    const budgetPaused = await isAiBatchBudgetPaused();
    for (const kind of ["index", "document_ocr", "sheet", "sheet_summary", "fit"] as const) {
      if (kind === "fit" && budgetPaused) continue;
      const available = config.concurrency[kind] - activeByKind[kind];
      if (available < 1) continue;
      const claimed = await claimAiJobs([kind], available, workerId);
      claimed.forEach(handle);
    }
    const { titleRewriteDailyLimit, titleRewriteProviderEnabled } = await import("../titles/title-rewrite");
    const { TEACHER_BATCH_SIZE } = await import("../titles/teacher");
    const openAiTitlesEnabled = titleRewriteProviderEnabled("openai");
    const titleBudgetPaused = openAiTitlesEnabled
      ? await isTitleTeacherBudgetPaused()
      : false;
    if (openAiTitlesEnabled && !titleBudgetPaused) await maybeEnqueueTitleBackfill();
    for (const provider of ["ollama", "openai"] as const) {
      if (titleBatchRunning[provider] || !titleRewriteProviderEnabled(provider)) continue;
      if (provider === "openai" && titleBudgetPaused) continue;
      const claimed = await claimTitleRewriteJobs(
        provider,
        TEACHER_BATCH_SIZE,
        workerId,
        config.visibilityMs,
        titleRewriteDailyLimit(provider),
      );
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
