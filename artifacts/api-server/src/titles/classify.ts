import { pool } from "@workspace/db";
import { categoryStudentEnabled, createOllamaClient, type OllamaClient } from "../ai/ollama-client";
import { toTenderCategories } from "../catalog/tender-categories";
import { tryRunSingletonJob } from "../jobs/job-lock";
import { logger } from "../lib/logger";
import { loadStudent, type LoadedStudent } from "./examples";
import { NEVER_STOP, type Progress, type StopSignal } from "./progress";
import { buildTenderSearchText, studentText } from "./text";

export const DEFAULT_CLASSIFY_STATUSES = ["open", "under_review"] as const;
const EMBED_CHUNK = 64;

type PendingRow = {
  id: string;
  title: string;
  display_title_norm: string;
  title_norm: string;
  object_norm: string;
  items_norm: string;
  organization_norm: string;
  other_norm: string;
};

const pendingWhere = `
  status = any($1::text[])
  and category_source is distinct from 'teacher'
  and (categorized_at is null or (category_source = 'student' and $2::timestamptz is not null and categorized_at < $2::timestamptz))`;

export type ClassifyResult = {
  skipped: "no_examples" | null;
  processed: number;
  categorized: number;
  belowThreshold: number;
  stopped: boolean;
};

/**
 * Classifies tenders without categories, or with student categories older than the newest
 * example. Never touches `teacher` categories. Resumable: processed rows leave the pending set.
 */
export async function classifyPendingTenders(options: {
  statuses?: readonly string[];
  batch?: number;
  limit?: number;
  client?: OllamaClient;
  loaded?: LoadedStudent;
  signal?: StopSignal;
  createProgress?: (total: number) => Progress;
} = {}): Promise<ClassifyResult> {
  const statuses = [...(options.statuses ?? DEFAULT_CLASSIFY_STATUSES)];
  const batch = options.batch ?? 256;
  const limit = options.limit ?? Number.MAX_SAFE_INTEGER;
  const signal = options.signal ?? NEVER_STOP;
  const client = options.client ?? createOllamaClient();
  const { student, latestExampleAt } = options.loaded ?? await loadStudent(client.config.embedModel);
  const result: ClassifyResult = { skipped: null, processed: 0, categorized: 0, belowThreshold: 0, stopped: false };
  if (student.size === 0) return { ...result, skipped: "no_examples" };

  const pending = await pool.query<{ count: number }>(
    `select count(*)::int as count from tenders where ${pendingWhere}`,
    [statuses, latestExampleAt],
  );
  const progress = options.createProgress?.(Math.min(limit, pending.rows[0]?.count ?? 0));
  let cursor = "";

  while (result.processed < limit) {
    if (signal.stopped) {
      result.stopped = true;
      break;
    }
    const rows = (await pool.query<PendingRow>(
      `select id, title, display_title_norm, title_norm, object_norm, items_norm, organization_norm, other_norm
       from tenders where ${pendingWhere} and id > $3
       order by id limit $4`,
      [statuses, latestExampleAt, cursor, Math.min(batch, limit - result.processed)],
    )).rows;
    if (rows.length === 0) break;

    const embeddings: number[][] = [];
    for (let start = 0; start < rows.length; start += EMBED_CHUNK) {
      const chunk = rows.slice(start, start + EMBED_CHUNK);
      embeddings.push(...(await client.embed(chunk.map(({ title }) => studentText(title)))).embeddings);
    }

    const ids: string[] = [];
    const categories: string[] = [];
    const confidences: number[] = [];
    const searchTexts: string[] = [];
    rows.forEach((row, index) => {
      const prediction = student.classify(embeddings[index]);
      ids.push(row.id);
      categories.push(JSON.stringify(toTenderCategories(prediction.categories)));
      confidences.push(prediction.confidence);
      searchTexts.push(buildTenderSearchText({
        titleNorm: row.title_norm,
        objectNorm: row.object_norm,
        itemsNorm: row.items_norm,
        organizationNorm: row.organization_norm,
        otherNorm: row.other_norm,
      }, row.display_title_norm, prediction.categories));
      if (prediction.categories.length > 0) result.categorized += 1;
      else result.belowThreshold += 1;
    });
    await pool.query(
      `update tenders t set
         categories = v.categories::jsonb,
         category_source = 'student',
         category_confidence = v.confidence,
         categorized_at = now(),
         search_text = v.search_text
       from unnest($1::text[], $2::text[], $3::real[], $4::text[]) as v(id, categories, confidence, search_text)
       where t.id = v.id and t.category_source is distinct from 'teacher'`,
      [ids, categories, confidences, searchTexts],
    );
    result.processed += rows.length;
    cursor = rows.at(-1)?.id ?? cursor;
    progress?.advance(rows.length);
  }
  return result;
}

/** Hook for the collector and the daily scheduler. Never throws; no-op unless the student is enabled. */
export async function classifyPendingInBackground(reason: string): Promise<void> {
  if (!categoryStudentEnabled()) return;
  try {
    const locked = await tryRunSingletonJob("category_classify", () => classifyPendingTenders());
    if (!locked.acquired) return;
    logger.info({ reason, ...locked.value }, "Category student classified pending tenders");
  } catch (error) {
    logger.warn({ err: error, reason }, "Category student classification failed");
  }
}
