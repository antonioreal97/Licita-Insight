import { pool } from "@workspace/db";
import { enqueueAiJob } from "../ai/ai-job-queue";
import { openAiConfig } from "../ai/config";
import { createOllamaClient, titleTeacherEnabled } from "../ai/ollama-client";
import { toTenderCategories } from "../catalog/tender-categories";
import { normalizeText } from "../domain/normalize";
import { logger } from "../lib/logger";
import { insertTitleExample } from "./examples";
import {
  ollamaTeacher,
  openAiTeacher,
  runTeacher,
  TITLE_TEACHER_PROMPT_VERSION,
  type TeacherBackend,
  type TeacherProvider,
} from "./teacher";
import { buildTenderSearchText, textHash } from "./text";

/** New and updated tenders go to the paid teacher; needs an OpenAI key besides the flag. */
export const titleTeacherOpenAiEnabled = (): boolean =>
  process.env.TITLE_TEACHER_OPENAI_ENABLED === "true" && openAiConfig().apiKey !== null;

export const titleRewriteProviderEnabled = (provider: TeacherProvider): boolean =>
  provider === "openai" ? titleTeacherOpenAiEnabled() : titleTeacherEnabled();

const nonNegativeInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
};

export const titleRewriteDailyLimit = (provider: TeacherProvider = "ollama"): number =>
  provider === "openai"
    ? nonNegativeInteger("TITLE_OPENAI_DAILY_LIMIT", 5_000)
    : nonNegativeInteger("TITLE_REWRITE_DAILY_LIMIT", 2_000);

/** Per tender, prompt version and official text: an updated official title gets a new job. */
export const titleRewriteDedupeKey = (tenderId: string, officialTitle: string): string =>
  `title_rewrite:${tenderId}:p${TITLE_TEACHER_PROMPT_VERSION}:${textHash(officialTitle).slice(0, 16)}`;

export const titleRewriteProvider = (payload: Record<string, unknown>): TeacherProvider =>
  payload.provider === "openai" ? "openai" : "ollama";

export const teacherBackendFor = (provider: TeacherProvider): TeacherBackend =>
  provider === "openai" ? openAiTeacher() : ollamaTeacher(createOllamaClient());

export type EnqueueTitleRewritesResult = { created: number; deduplicated: number; dailyLimited: number; ineligible: number };

const ELIGIBLE: Record<TeacherProvider, string> = {
  // On demand: only rules titles that asked for the model.
  ollama: "display_title_source = 'rules' and display_title_needs_model",
  // New or updated official titles: every one, replacing a model title written for the old text.
  openai: "true",
};

async function enqueueFor(provider: TeacherProvider, tenderIds: readonly string[]): Promise<EnqueueTitleRewritesResult> {
  const result: EnqueueTitleRewritesResult = { created: 0, deduplicated: 0, dailyLimited: 0, ineligible: 0 };
  const ids = [...new Set(tenderIds)];
  if (ids.length === 0) return result;
  const eligible = (await pool.query<{ id: string; title: string }>(
    `select id, title from tenders
     where id = any($1::text[]) and ${ELIGIBLE[provider]}
     order by array_position($1::text[], id)`,
    [ids],
  )).rows;
  result.ineligible = ids.length - eligible.length;
  if (eligible.length === 0) return result;

  const limit = titleRewriteDailyLimit(provider);
  let createdToday = (await pool.query<{ count: number }>(
    `select count(*)::int as count from ai_jobs
     where kind = 'title_rewrite' and coalesce(payload->>'provider', 'ollama') = $1
       and created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`,
    [provider],
  )).rows[0]?.count ?? 0;

  for (const tender of eligible) {
    const dedupeKey = titleRewriteDedupeKey(tender.id, tender.title);
    const existing = await pool.query("select 1 from ai_jobs where dedupe_key = $1", [dedupeKey]);
    if ((existing.rowCount ?? 0) > 0) {
      result.deduplicated += 1;
      continue;
    }
    if (createdToday >= limit) {
      result.dailyLimited += 1;
      continue;
    }
    const enqueued = await enqueueAiJob({
      kind: "title_rewrite",
      dedupeKey,
      tenderId: tender.id,
      payload: { promptVersion: TITLE_TEACHER_PROMPT_VERSION, provider },
      lane: "batch",
      maxAttempts: 3,
    });
    if (enqueued.reason === "created") {
      result.created += 1;
      createdToday += 1;
    } else if (enqueued.reason === "deduplicated") {
      result.deduplicated += 1;
    }
  }
  return result;
}

/** On-demand rewrite by the local teacher for tenders people are looking at. */
export const enqueueTitleRewrites = (tenderIds: readonly string[]): Promise<EnqueueTitleRewritesResult> =>
  enqueueFor("ollama", tenderIds);

/** New and updated tenders from the collector, rewritten by the paid teacher. */
export const enqueueOpenAiTitleRewrites = (tenderIds: readonly string[]): Promise<EnqueueTitleRewritesResult> =>
  enqueueFor("openai", tenderIds);

/** Fire-and-forget from search and detail: never blocks or fails the request. */
export function scheduleTitleRewrites(tenderIds: readonly string[]): void {
  if (!titleTeacherEnabled() || tenderIds.length === 0) return;
  void enqueueTitleRewrites(tenderIds).catch((error) => {
    logger.warn({ err: error, tenders: tenderIds.length }, "Title rewrite enqueue failed");
  });
}

/** Called by the collector after upserting; never throws into the collect. */
export async function enqueueCollectedTitleRewrites(tenderIds: readonly string[]): Promise<void> {
  if (!titleTeacherOpenAiEnabled() || tenderIds.length === 0) return;
  try {
    const result = await enqueueOpenAiTitleRewrites(tenderIds);
    if (result.dailyLimited > 0) logger.warn({ ...result }, "OpenAI title rewrite daily limit reached");
  } catch (error) {
    logger.warn({ err: error, tenders: tenderIds.length }, "OpenAI title rewrite enqueue failed");
  }
}

type TenderRow = {
  id: string;
  title: string;
  display_title_source: "rules" | "model" | null;
  display_title_norm: string;
  title_norm: string;
  object_norm: string;
  items_norm: string;
  organization_norm: string;
  other_norm: string;
  categories: { slug: string }[];
};

export type TitleRewriteOutcome = "rewritten" | "categories_only" | "rejected" | "skipped";

/**
 * Worker side of `title_rewrite`: one teacher call for up to ten tenders. A failed call throws
 * (every job retries); a failed write only fails its own job.
 */
export async function executeTitleRewriteBatch(
  tenderIds: readonly string[],
  teacher: TeacherBackend,
): Promise<(TitleRewriteOutcome | Error)[]> {
  // Paid jobs exist only for new or changed official titles, so they replace an older model title.
  const replaceModel = teacher.provider === "openai";
  const rows = new Map((await pool.query<TenderRow>(
    `select id, title, display_title_source, display_title_norm, title_norm, object_norm, items_norm,
            organization_norm, other_norm, categories
     from tenders where id = any($1::text[])`,
    [[...tenderIds]],
  )).rows.map((row) => [row.id, row]));
  const todo = [...new Set(tenderIds)]
    .map((id) => rows.get(id))
    .filter((row): row is TenderRow => row !== undefined && (replaceModel || row.display_title_source !== "model"));
  const outcomes = new Map<string, TitleRewriteOutcome | Error>();
  if (todo.length > 0) {
    const run = await runTeacher(todo.map(({ title }) => title), teacher);
    const paid = todo.flatMap((tender, index) => {
      const usage = run.usage[index];
      return usage ? [{ tenderId: tender.id, ...usage }] : [];
    });
    if (paid.length > 0) {
      await pool.query(
        `insert into ai_title_usage (tender_id, model, input_tokens, output_tokens, estimated_cost_usd)
         select tender_id, $2, input_tokens, output_tokens, cost
         from unnest($1::text[], $3::int[], $4::int[], $5::numeric[]) as u(tender_id, input_tokens, output_tokens, cost)`,
        [paid.map(({ tenderId }) => tenderId), run.model, paid.map(({ inputTokens }) => inputTokens),
          paid.map(({ outputTokens }) => outputTokens), paid.map(({ costUsd }) => costUsd.toFixed(8))],
      );
    }
    for (const [index, tender] of todo.entries()) {
      try {
        outcomes.set(tender.id, await applyTeacherResult(tender, run.results[index], run.model, replaceModel));
      } catch (error) {
        outcomes.set(tender.id, error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
  return tenderIds.map((id) => outcomes.get(id) ?? "skipped");
}

async function applyTeacherResult(
  tender: TenderRow,
  item: Awaited<ReturnType<typeof runTeacher>>["results"][number] | undefined,
  model: string,
  replaceModel: boolean,
): Promise<TitleRewriteOutcome> {
  if (!item) return "rejected";
  const norms = {
    titleNorm: tender.title_norm,
    objectNorm: tender.object_norm,
    itemsNorm: tender.items_norm,
    organizationNorm: tender.organization_norm,
    otherNorm: tender.other_norm,
  };
  const teacherCategories = item.categories.length > 0;
  const categorySlugs = teacherCategories ? item.categories : tender.categories.map(({ slug }) => slug);
  const displayTitleNorm = item.title ? normalizeText(item.title) : tender.display_title_norm;
  const searchText = buildTenderSearchText(norms, displayTitleNorm, categorySlugs);
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    // The official title may have changed while the job waited; then this answer is stale.
    const current = await connection.query(
      "select 1 from tenders where id = $1 and title = $2 for update",
      [tender.id, tender.title],
    );
    if ((current.rowCount ?? 0) === 0) {
      await connection.query("rollback");
      return "skipped";
    }
    if (item.title) {
      await connection.query(
        `update tenders set display_title = $2, display_title_source = 'model', display_title_version = $3,
           display_title_norm = $4, display_title_needs_model = false, search_text = $5
         where id = $1 and ($6 or display_title_source is distinct from 'model')`,
        [tender.id, item.title, TITLE_TEACHER_PROMPT_VERSION, displayTitleNorm, searchText, replaceModel],
      );
    }
    if (teacherCategories) {
      await connection.query(
        `update tenders set categories = $2::jsonb, category_source = 'teacher', category_confidence = null,
           categorized_at = now(), search_text = $3
         where id = $1`,
        [tender.id, JSON.stringify(toTenderCategories(item.categories)), searchText],
      );
    }
    await insertTitleExample({
      sourceText: tender.title,
      tenderId: tender.id,
      result: item,
      teacherModel: model,
      promptVersion: TITLE_TEACHER_PROMPT_VERSION,
    }, connection);
    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
  return item.title ? "rewritten" : teacherCategories ? "categories_only" : "rejected";
}

/** Single-job path (APP_ROLE=all inline runs and tests). */
export async function executeTitleRewriteJob(
  tenderId: string,
  teacher: TeacherBackend | ReturnType<typeof createOllamaClient> = createOllamaClient(),
): Promise<TitleRewriteOutcome> {
  const backend = "complete" in teacher ? teacher : ollamaTeacher(teacher);
  const [outcome] = await executeTitleRewriteBatch([tenderId], backend);
  if (outcome instanceof Error) throw outcome;
  return outcome ?? "skipped";
}
