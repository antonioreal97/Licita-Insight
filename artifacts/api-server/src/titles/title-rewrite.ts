import { pool } from "@workspace/db";
import { enqueueAiJob } from "../ai/ai-job-queue";
import { createOllamaClient, titleTeacherEnabled, type OllamaClient } from "../ai/ollama-client";
import { toTenderCategories } from "../catalog/tender-categories";
import { normalizeText } from "../domain/normalize";
import { logger } from "../lib/logger";
import { insertTitleExample } from "./examples";
import { runTeacher, TITLE_TEACHER_PROMPT_VERSION } from "./teacher";
import { buildTenderSearchText } from "./text";

export const titleRewriteDailyLimit = (): number => {
  const raw = process.env.TITLE_REWRITE_DAILY_LIMIT?.trim();
  if (!raw) return 2_000;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("TITLE_REWRITE_DAILY_LIMIT must be a non-negative integer");
  return value;
};

export const titleRewriteDedupeKey = (tenderId: string): string =>
  `title_rewrite:${tenderId}:p${TITLE_TEACHER_PROMPT_VERSION}`;

export type EnqueueTitleRewritesResult = { created: number; deduplicated: number; dailyLimited: number; ineligible: number };

/** Enqueues a rewrite for each visible tender whose rules title asked for the model. */
export async function enqueueTitleRewrites(tenderIds: readonly string[]): Promise<EnqueueTitleRewritesResult> {
  const result: EnqueueTitleRewritesResult = { created: 0, deduplicated: 0, dailyLimited: 0, ineligible: 0 };
  const ids = [...new Set(tenderIds)];
  if (ids.length === 0) return result;
  const eligible = (await pool.query<{ id: string }>(
    `select id from tenders
     where id = any($1::text[]) and display_title_source = 'rules' and display_title_needs_model
     order by array_position($1::text[], id)`,
    [ids],
  )).rows.map(({ id }) => id);
  result.ineligible = ids.length - eligible.length;
  if (eligible.length === 0) return result;

  const limit = titleRewriteDailyLimit();
  let createdToday = (await pool.query<{ count: number }>(
    `select count(*)::int as count from ai_jobs
     where kind = 'title_rewrite'
       and created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`,
  )).rows[0]?.count ?? 0;

  for (const tenderId of eligible) {
    const existing = await pool.query("select 1 from ai_jobs where dedupe_key = $1", [titleRewriteDedupeKey(tenderId)]);
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
      dedupeKey: titleRewriteDedupeKey(tenderId),
      tenderId,
      payload: { promptVersion: TITLE_TEACHER_PROMPT_VERSION },
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

/** Fire-and-forget from search and detail: never blocks or fails the request. */
export function scheduleTitleRewrites(tenderIds: readonly string[]): void {
  if (!titleTeacherEnabled() || tenderIds.length === 0) return;
  void enqueueTitleRewrites(tenderIds).catch((error) => {
    logger.warn({ err: error, tenders: tenderIds.length }, "Title rewrite enqueue failed");
  });
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

/** Worker side of `title_rewrite`. An Ollama failure throws so the queue retries with backoff. */
export async function executeTitleRewriteJob(
  tenderId: string,
  client: OllamaClient = createOllamaClient(),
): Promise<TitleRewriteOutcome> {
  const tender = (await pool.query<TenderRow>(
    `select id, title, display_title_source, display_title_norm, title_norm, object_norm, items_norm,
            organization_norm, other_norm, categories
     from tenders where id = $1`,
    [tenderId],
  )).rows[0];
  if (!tender || tender.display_title_source === "model") return "skipped";

  const run = await runTeacher([tender.title], client);
  const item = run.results[0];
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
    if (item.title) {
      await connection.query(
        `update tenders set display_title = $2, display_title_source = 'model', display_title_version = $3,
           display_title_norm = $4, display_title_needs_model = false, search_text = $5
         where id = $1 and display_title_source is distinct from 'model'`,
        [tenderId, item.title, TITLE_TEACHER_PROMPT_VERSION, displayTitleNorm, searchText],
      );
    }
    if (teacherCategories) {
      await connection.query(
        `update tenders set categories = $2::jsonb, category_source = 'teacher', category_confidence = null,
           categorized_at = now(), search_text = $3
         where id = $1`,
        [tenderId, JSON.stringify(toTenderCategories(item.categories)), searchText],
      );
    }
    await insertTitleExample({
      sourceText: tender.title,
      tenderId,
      result: item,
      teacherModel: run.model,
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
