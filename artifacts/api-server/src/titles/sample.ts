import { pool } from "@workspace/db";
import type { OllamaClient } from "../ai/ollama-client";
import { logger } from "../lib/logger";
import { insertTitleExample } from "./examples";
import { NEVER_STOP, type Progress, type StopSignal } from "./progress";
import { runTeacher, TEACHER_BATCH_SIZE, TITLE_TEACHER_PROMPT_VERSION } from "./teacher";
import { studentText, textHash } from "./text";

const REGION_BY_UF: Record<string, string> = {
  AC: "N", AM: "N", AP: "N", PA: "N", RO: "N", RR: "N", TO: "N",
  AL: "NE", BA: "NE", CE: "NE", MA: "NE", PB: "NE", PE: "NE", PI: "NE", RN: "NE", SE: "NE",
  DF: "CO", GO: "CO", MS: "CO", MT: "CO",
  ES: "SE", MG: "SE", RJ: "SE", SP: "SE",
  PR: "S", RS: "S", SC: "S",
};

const lengthBucket = (length: number): string => (length <= 60 ? "short" : length <= 150 ? "medium" : "long");

export type SampleCandidate = { id: string; title: string; modality: string; state: string | null; orderKey: string };

/**
 * Deterministic stratified plan: dedupe by normalized text (first by md5 order wins), then
 * allocate the size proportionally to modality × text length × region, largest remainder first.
 */
export const planTeacherSample = (candidates: readonly SampleCandidate[], size: number): SampleCandidate[] => {
  const seen = new Set<string>();
  const strata = new Map<string, SampleCandidate[]>();
  for (const candidate of [...candidates].sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id))) {
    const hash = textHash(candidate.title);
    if (studentText(candidate.title) === "" || seen.has(hash)) continue;
    seen.add(hash);
    const key = [
      candidate.modality,
      lengthBucket(studentText(candidate.title).length),
      REGION_BY_UF[candidate.state?.toUpperCase() ?? ""] ?? "?",
    ].join("|");
    const stratum = strata.get(key) ?? [];
    stratum.push(candidate);
    strata.set(key, stratum);
  }
  const total = seen.size;
  const target = Math.min(size, total);
  if (target === 0) return [];
  const quotas = [...strata.entries()].map(([key, members]) => {
    const exact = (target * members.length) / total;
    return { key, members, quota: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let missing = target - quotas.reduce((sum, { quota }) => sum + quota, 0);
  for (const entry of [...quotas].sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key))) {
    if (missing === 0) break;
    if (entry.quota < entry.members.length) {
      entry.quota += 1;
      missing -= 1;
    }
  }
  return quotas
    .flatMap(({ members, quota }) => members.slice(0, quota))
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id));
};

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

/** Labels the planned sample with the teacher, concurrency 1, skipping hashes already labeled. */
export async function runTeacherSample(options: {
  size: number;
  client: OllamaClient;
  statuses?: readonly string[];
  signal?: StopSignal;
  createProgress?: (total: number) => Progress;
}): Promise<TeacherSampleResult> {
  const signal = options.signal ?? NEVER_STOP;
  const candidates = (await pool.query<{ id: string; title: string; modality: string; state: string | null; order_key: string }>(
    `select id, title, modality, state, md5(id || ':teacher-sample') as order_key
     from tenders where status = any($1::text[])`,
    [[...(options.statuses ?? ["open", "under_review"])]],
  )).rows.map((row) => ({ id: row.id, title: row.title, modality: row.modality, state: row.state, orderKey: row.order_key }));
  const plan = planTeacherSample(candidates, options.size);
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
