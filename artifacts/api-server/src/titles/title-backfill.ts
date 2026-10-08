import { TITLE_TEACHER_PROMPT_VERSION } from "./teacher";

const positiveInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

export const titleBackfillConfig = () => ({
  enabled: process.env.TITLE_BACKFILL_ENABLED?.trim().toLowerCase() !== "false",
  batchSize: positiveInteger("TITLE_BACKFILL_BATCH_SIZE", 50),
  intervalMs: positiveInteger("TITLE_BACKFILL_INTERVAL_MS", 5 * 60_000),
});

const hourInSaoPaulo = (now: Date): number => Number(new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  hourCycle: "h23",
}).format(now));

/** The 06:00 hour is reserved for the daily PNCP collection. */
export const titleBackfillAllowedAt = (now: Date): boolean => hourInSaoPaulo(now) !== 6;

export type TitleBackfillResult = {
  selected: number;
  created: number;
  deduplicated: number;
  skippedQueued: number;
};

export async function enqueueTitleBackfillBatch(options: {
  dailyCapacity: number;
  batchSize?: number;
}): Promise<TitleBackfillResult> {
  const { pool } = await import("@workspace/db");
  const batchSize = Math.max(1, Math.min(500, options.batchSize ?? titleBackfillConfig().batchSize));
  const queued = (await pool.query<{ count: number }>(
    `select count(*)::int as count from ai_jobs
     where kind = 'title_rewrite' and payload->>'provider' = 'openai'
       and status in ('queued', 'running')`,
  )).rows[0]?.count ?? 0;
  const available = Math.max(0, Math.min(batchSize, options.dailyCapacity - queued));
  if (available < 1) return { selected: 0, created: 0, deduplicated: 0, skippedQueued: queued };

  const ids = (await pool.query<{ id: string }>(
    `select t.id from tenders t
     where t.status = 'open' and t.display_title_source = 'rules'
       and not exists (
         select 1 from ai_jobs j
         where j.tender_id = t.id and j.kind = 'title_rewrite'
           and j.payload->>'provider' = 'openai'
           and (j.payload->>'promptVersion')::int = $2
       )
     order by case when jsonb_array_length(t.categories) = 0 then 0 else 1 end,
       t.proposal_deadline asc nulls last, t.published_at asc nulls last, t.id
     limit $1`,
    [available, TITLE_TEACHER_PROMPT_VERSION],
  )).rows.map(({ id }) => id);
  const { enqueueOpenAiTitleRewrites } = await import("./title-rewrite");
  const enqueued = await enqueueOpenAiTitleRewrites(ids);
  return {
    selected: ids.length,
    created: enqueued.created,
    deduplicated: enqueued.deduplicated,
    skippedQueued: queued,
  };
}
