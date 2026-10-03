import { pool } from "@workspace/db";
import type { OllamaClient } from "../ai/ollama-client";
import { logger } from "../lib/logger";
import { insertTitleExample, loadStudent, type LoadedStudent } from "./examples";
import { NEVER_STOP, type Progress, type StopSignal } from "./progress";
import {
  planTeacherSample,
  selectFocusedCandidates,
  type FocusedSampleCandidate,
  type SampleCandidate,
} from "./sample-plan";
import { runTeacher, TEACHER_BATCH_SIZE, TITLE_TEACHER_PROMPT_VERSION } from "./teacher";
import { studentText, textHash } from "./text";

export { planTeacherSample, selectFocusedCandidates } from "./sample-plan";
export type { FocusedSampleCandidate, SampleCandidate } from "./sample-plan";

export type TeacherSampleResult = {
  planned: number;
  alreadyLabeled: number;
  labeled: number;
  acceptedTitles: number;
  withCategories: number;
  failedBatches: number;
  stopped: boolean;
};

const MAX_CONSECUTIVE_FAILURES = 3;

type SampleOptions = {
  size: number;
  client: OllamaClient;
  statuses?: readonly string[];
  /** Student categories to reinforce; switches from the stratified plan to the focused one. */
  focus?: readonly string[];
  loaded?: LoadedStudent;
  signal?: StopSignal;
  createProgress?: (total: number) => Progress;
};

const FOCUS_POOL_FACTOR = 10;
const FOCUS_EMBED_CHUNK = 64;

/**
 * Uncertainty sampling for the classes the student confuses: among student-classified tenders
 * without a chip or with a focus category, re-predicts a deterministic pool and takes the least
 * confident ones whose winning category is in focus, round-robin across the focus classes. The
 * plan deliberately includes already-labeled texts; runTeacherSample filters those afterwards so
 * rerunning an interrupted focused sample resumes the same target instead of adding a fresh batch.
 */
export async function planFocusedSample(options: SampleOptions & { focus: readonly string[] }): Promise<SampleCandidate[]> {
  const focus = new Set(options.focus);
  const { student } = options.loaded ?? await loadStudent(options.client.config.embedModel);
  if (student.size === 0 || focus.size === 0) return [];
  const rows = (await pool.query<{ id: string; title: string; modality: string; state: string | null; order_key: string }>(
    `select id, title, modality, state, md5(id || ':teacher-focus') as order_key
     from tenders
     where status = any($1::text[]) and category_source = 'student'
       and (jsonb_array_length(categories) = 0 or categories->0->>'slug' = any($2::text[]))
     order by order_key, id`,
    [[...(options.statuses ?? ["open", "under_review"])], [...focus]],
  )).rows;
  const seen = new Set<string>();
  const focusPool: SampleCandidate[] = [];
  for (const row of rows) {
    const hash = textHash(row.title);
    if (studentText(row.title) === "" || seen.has(hash)) continue;
    seen.add(hash);
    focusPool.push({ id: row.id, title: row.title, modality: row.modality, state: row.state, orderKey: row.order_key });
    if (focusPool.length >= options.size * FOCUS_POOL_FACTOR) break;
  }

  const ranked: FocusedSampleCandidate[] = [];
  for (let start = 0; start < focusPool.length; start += FOCUS_EMBED_CHUNK) {
    const chunk = focusPool.slice(start, start + FOCUS_EMBED_CHUNK);
    const { embeddings } = await options.client.embed(chunk.map(({ title }) => studentText(title)));
    chunk.forEach((candidate, index) => {
      const prediction = student.classify(embeddings[index]);
      if (!prediction.primary || !focus.has(prediction.primary)) return;
      ranked.push({ candidate, primary: prediction.primary, confidence: prediction.confidence });
    });
  }
  return selectFocusedCandidates(ranked, options.focus, options.size);
}

/** Labels the planned sample with the teacher, concurrency 1, skipping hashes already labeled. */
export async function runTeacherSample(options: SampleOptions): Promise<TeacherSampleResult> {
  const signal = options.signal ?? NEVER_STOP;
  let plan: SampleCandidate[];
  if (options.focus && options.focus.length > 0) {
    plan = await planFocusedSample({ ...options, focus: options.focus });
  } else {
    const candidates = (await pool.query<{ id: string; title: string; modality: string; state: string | null; order_key: string }>(
      `select id, title, modality, state, md5(id || ':teacher-sample') as order_key
       from tenders where status = any($1::text[])`,
      [[...(options.statuses ?? ["open", "under_review"])]],
    )).rows.map((row) => ({ id: row.id, title: row.title, modality: row.modality, state: row.state, orderKey: row.order_key }));
    plan = planTeacherSample(candidates, options.size);
  }
  const hashes = plan.map(({ title }) => textHash(title));
  const labeled = new Set((await pool.query<{ text_hash: string }>(
    "select text_hash from tender_title_examples where text_hash = any($1::text[])",
    [hashes],
  )).rows.map(({ text_hash }) => text_hash));
  const pending = plan.filter((_, index) => !labeled.has(hashes[index]));
  const result: TeacherSampleResult = {
    planned: plan.length,
    alreadyLabeled: plan.length - pending.length,
    labeled: 0,
    acceptedTitles: 0,
    withCategories: 0,
    failedBatches: 0,
    stopped: false,
  };
  const progress = options.createProgress?.(pending.length);
  let consecutiveFailures = 0;

  for (let start = 0; start < pending.length; start += TEACHER_BATCH_SIZE) {
    if (signal.stopped) {
      result.stopped = true;
      break;
    }
    const batch = pending.slice(start, start + TEACHER_BATCH_SIZE);
    try {
      const run = await runTeacher(batch.map(({ title }) => title), options.client);
      consecutiveFailures = 0;
      for (const [index, candidate] of batch.entries()) {
        const item = run.results[index];
        if (!item) continue;
        if (await insertTitleExample({
          sourceText: candidate.title,
          tenderId: candidate.id,
          result: item,
          teacherModel: run.model,
          promptVersion: TITLE_TEACHER_PROMPT_VERSION,
        })) result.labeled += 1;
        if (item.title) result.acceptedTitles += 1;
        if (item.categories.length > 0) result.withCategories += 1;
      }
      progress?.advance(batch.length, `${(run.durationMs / batch.length / 1_000).toFixed(1)} s/título`);
    } catch (error) {
      result.failedBatches += 1;
      consecutiveFailures += 1;
      logger.warn({ err: error, batchStart: start }, "Teacher batch failed; it stays pending for the next run");
      progress?.advance(batch.length, "lote falhou");
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw error;
    }
  }
  return result;
}
