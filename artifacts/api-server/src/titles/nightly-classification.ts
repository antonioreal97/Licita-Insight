import { pool } from "@workspace/db";
import type { JevTenderCategory } from "../ai/jev-client";
import { createOllamaClient, OllamaError, type OllamaClient } from "../ai/ollama-client";
import { isTenderCategorySlug, toTenderCategories } from "../catalog/tender-categories";
import { logger } from "../lib/logger";
import { SAO_PAULO_TIME_ZONE } from "../lib/sao-paulo-date";
import { incrementMetric, setMetric } from "../metrics";
import { DEFAULT_CLASSIFY_STATUSES } from "./classify";
import { embedPendingExamples } from "./embed-examples";
import { insertTitleExample, loadStudent } from "./examples";
import {
  JEV_TEACHER_PROMPT_VERSION,
  JEV_TEACHER_USAGE_PREFIX,
  jevCategories,
  type JevCategoryTeacher,
} from "./jev-teacher";
import { nightlyCategoryConfig, type NightlyCategoryConfig } from "./nightly-window";
import { NEVER_STOP, type StopSignal } from "./progress";
import type { CategoryStudent, StudentPrediction } from "./student";
import { buildTenderSearchText, studentText, textHash } from "./text";

const JEV_USD_PER_INPUT_TOKEN = 0.000000042;
const JEV_CALL_GUARD_MS = 120_000;
const JEV_FAILURES_BEFORE_GIVING_UP = 5;
const MAX_NIGHT_PREDICTIONS = 50_000;
/** `ingest_runs.source` of the nightly summary: the history behind the agreement panel and alert. */
export const NIGHTLY_CATEGORY_RUN_SOURCE = "nightly-category";
const EMBED_ATTEMPTS = 4;

/** Waits up to `ms`, returning early when the night stops (window closed or shutdown). */
const pause = async (ms: number, signal: StopSignal): Promise<void> => {
  const until = Date.now() + ms;
  while (!signal.stopped && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, until - Date.now())));
  }
};

/**
 * The first request of the night loads the model from disk and may time out on a slow machine.
 * It is asked again after a growing pause (`embedRetryDelayMs` times the attempt), so a model still
 * loading under memory pressure gets time instead of more requests. A 4xx is a configuration error
 * and is not repeated.
 */
const patientEmbedding = (client: OllamaClient, retryDelayMs: number, signal: StopSignal): OllamaClient => ({
  ...client,
  async embed(texts) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await client.embed(texts);
      } catch (error) {
        const transient = error instanceof OllamaError && (error.kind !== "http" || (error.status ?? 500) >= 500);
        if (!transient || attempt >= EMBED_ATTEMPTS || signal.stopped) throw error;
        const waitMs = retryDelayMs * attempt;
        logger.warn({ err: error, attempt, waitMs }, "Ollama embedding failed; trying again");
        await pause(waitMs, signal);
      }
    }
  },
});

export type JevSkipReason = "disabled" | "budget_paused" | "daily_limit" | "unavailable";

export type NightlyTotals = {
  examplesEmbedded: number;
  /** Tenders the student evaluated. */
  processed: number;
  /** Of those, how many needed no new embedding: a labelled example or a title already seen tonight. */
  reused: number;
  /** Student category written. */
  categorized: number;
  /** Below the display minimum: the previous category stays. */
  kept: number;
  /** Below the Jev threshold. */
  lowConfidence: number;
  jevSent: number;
  jevTaught: number;
  /** Jev answered below its own minimum confidence. */
  jevRejected: number;
  jevFailed: number;
  jevInputTokens: number;
  jevCostUsd: number;
  examplesAdded: number;
};

export type NightlyBacklog = {
  pendingTenders: number;
  pendingExamples: number;
  jevBacklog: number;
  jevCallsToday: number;
  jevCostTodayUsd: number;
};

/** Student against the teachers' labels on examples it never saw (the holdout split). */
export type NightlyHoldout = {
  /**
   * Examples created before this instant (ISO) are the ones scored: the same test every night.
   * Null when the whole holdout was scored.
   */
  frozenAt: string | null;
  total: number;
  /** Share whose first category is the teacher's. */
  agreement: number;
  /** Share at or above the display minimum, and the agreement among those. */
  coverage: number;
  agreementCovered: number;
  /** Share below the Jev threshold: what the night is expected to send to the teacher. */
  belowJevThreshold: number;
  /** Confidence below which 10%, 15% and 20% of the sample fall: the threshold for that share. */
  thresholdForShare: { p10: number; p15: number; p20: number };
  /** Agreement inside each confidence band with at least one example: what a threshold there would keep or send. */
  bands: { from: number; to: number; total: number; agreement: number }[];
};

export type NightlyResult = NightlyTotals & NightlyBacklog & {
  /** Nothing left for this night; false when the window closed or the process is stopping. */
  complete: boolean;
  stopped: boolean;
  skipped: "no_examples" | null;
  jevSkipped: JevSkipReason | null;
  embedModel: string;
  trainExamples: number;
  holdout: NightlyHoldout | null;
  /**
   * The newest holdout examples, created after the frozen set: how the student does on tonight's
   * kind of doubt. Informative only; the alert follows `holdout`.
   */
  holdoutRecent: NightlyHoldout | null;
  durationMs: number;
};

type TenderRow = {
  id: string;
  title: string;
  display_title_norm: string;
  title_norm: string;
  object_norm: string;
  items_norm: string;
  organization_norm: string;
  other_norm: string;
  cursor: string;
  biddable: boolean;
};

type TeachCandidate = Omit<TenderRow, "cursor" | "biddable">;

const TENDER_COLUMNS =
  "t.id, t.title, t.display_title_norm, t.title_norm, t.object_norm, t.items_norm, t.organization_norm, t.other_norm";

/** Not a teacher's and not yet evaluated by the student since the official title last changed. */
const STUDENT_PENDING = `
  t.status = any($1::text[])
  and t.category_source is distinct from 'teacher'
  and (t.category_confidence is null or t.categorized_at is null)`;

/** Still taking proposals: a teacher's category is worth paying for only where someone can still bid. */
const BIDDABLE = "(t.proposal_deadline is null or t.proposal_deadline > now())";

/** Evaluated with low confidence, still biddable and not yet shown to Jev since that evaluation. */
const JEV_PENDING = `
  t.status = any($1::text[])
  and ${BIDDABLE}
  and t.category_source is distinct from 'teacher'
  and t.categorized_at is not null
  and t.category_confidence < $2
  and not exists (
    select 1 from ai_title_usage u
    where u.tender_id = t.id and u.model like '${JEV_TEACHER_USAGE_PREFIX}%' and u.created_at >= t.categorized_at
  )`;

const SAO_PAULO_DAY_START = `(date_trunc('day', $1::timestamptz at time zone '${SAO_PAULO_TIME_ZONE}') at time zone '${SAO_PAULO_TIME_ZONE}')`;

const norms = (row: TeachCandidate) => ({
  titleNorm: row.title_norm,
  objectNorm: row.object_norm,
  itemsNorm: row.items_norm,
  organizationNorm: row.organization_norm,
  otherNorm: row.other_norm,
});

export async function jevTeacherCallsToday(now: Date): Promise<{ calls: number; costUsd: number }> {
  const result = await pool.query<{ calls: number; cost: string }>(
    `select count(*)::int as calls, coalesce(sum(estimated_cost_usd), 0)::text as cost
     from ai_title_usage
     where model like '${JEV_TEACHER_USAGE_PREFIX}%' and created_at >= ${SAO_PAULO_DAY_START}`,
    [now],
  );
  return { calls: result.rows[0]?.calls ?? 0, costUsd: Number(result.rows[0]?.cost ?? 0) };
}

export async function loadNightlyBacklog(options: {
  statuses: readonly string[];
  embedModel: string;
  threshold: number;
  now: Date;
}): Promise<NightlyBacklog> {
  const statuses = [...options.statuses];
  const [tenders, examples, jev, today] = await Promise.all([
    pool.query<{ count: number }>(`select count(*)::int as count from tenders t where ${STUDENT_PENDING}`, [statuses]),
    pool.query<{ count: number }>(
      "select count(*)::int as count from tender_title_examples where embedding is null or embedding_model is distinct from $1",
      [options.embedModel],
    ),
    pool.query<{ count: number }>(
      `select count(*)::int as count from tenders t where ${JEV_PENDING}`,
      [statuses, options.threshold],
    ),
    jevTeacherCallsToday(options.now),
  ]);
  return {
    pendingTenders: tenders.rows[0]?.count ?? 0,
    pendingExamples: examples.rows[0]?.count ?? 0,
    jevBacklog: jev.rows[0]?.count ?? 0,
    jevCallsToday: today.calls,
    jevCostTodayUsd: today.costUsd,
  };
}

/** The student runs in the process that serves the API: one tender at a time, then the event loop. */
const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const share = (part: number, whole: number): number => (whole === 0 ? 0 : Number((part / whole).toFixed(4)));

const HOLDOUT_BAND_EDGES = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/**
 * Scores the student on held-out examples. `frozen` takes those created before `frozenAt` (all of
 * them when it is null), in a fixed order; `recent` takes the newest created from `frozenAt` on.
 */
export async function evaluateHoldoutSample(options: {
  student: CategoryStudent;
  embedModel: string;
  threshold: number;
  limit: number;
  frozenAt?: Date | null;
  part?: "frozen" | "recent";
}): Promise<NightlyHoldout | null> {
  const frozenAt = options.frozenAt ?? null;
  const part = options.part ?? "frozen";
  if (part === "recent" && frozenAt === null) return null;
  const slice = part === "recent"
    ? "and created_at >= $3 order by created_at desc, text_hash"
    : "and ($3::timestamptz is null or created_at < $3) order by text_hash";
  const rows = (await pool.query<{ categories: string[]; embedding: number[] }>(
    `select categories, embedding from tender_title_examples
     where split = 'holdout' and embedding is not null and embedding_model = $1 and cardinality(categories) > 0
     ${slice} limit $2`,
    [options.embedModel, options.limit, frozenAt],
  )).rows;
  if (rows.length === 0) return null;
  let agree = 0;
  let covered = 0;
  let agreeCovered = 0;
  let below = 0;
  const confidences: number[] = [];
  const bands = HOLDOUT_BAND_EDGES.slice(1).map((to, index) => ({ from: HOLDOUT_BAND_EDGES[index], to, total: 0, hits: 0 }));
  for (const row of rows) {
    const prediction = options.student.classify(row.embedding);
    const hit = prediction.primary === row.categories[0];
    const band = bands.find(({ to }) => prediction.confidence < to) ?? bands[bands.length - 1];
    band.total += 1;
    if (hit) band.hits += 1;
    if (hit) agree += 1;
    if (prediction.categories.length > 0) {
      covered += 1;
      if (hit) agreeCovered += 1;
    }
    if (prediction.confidence < options.threshold) below += 1;
    confidences.push(prediction.confidence);
    await yieldToEventLoop();
  }
  confidences.sort((left, right) => left - right);
  const quantile = (part: number): number =>
    Number(confidences[Math.min(confidences.length - 1, Math.floor(part * confidences.length))].toFixed(4));
  return {
    frozenAt: frozenAt?.toISOString() ?? null,
    total: rows.length,
    agreement: share(agree, rows.length),
    coverage: share(covered, rows.length),
    agreementCovered: share(agreeCovered, covered),
    belowJevThreshold: share(below, rows.length),
    thresholdForShare: { p10: quantile(0.1), p15: quantile(0.15), p20: quantile(0.2) },
    bands: bands.filter(({ total }) => total > 0)
      .map(({ from, to, total, hits }) => ({ from, to, total, agreement: share(hits, total) })),
  };
}

/**
 * Keeps the summary of every run that measured the holdout, so agreement can be followed night by
 * night (admin dashboard, monitor alert). A failed write is logged and never fails the night.
 */
async function recordNightlyRun(result: NightlyResult, startedAt: Date, deadline: Date): Promise<void> {
  if (!result.holdout) return;
  try {
    await pool.query(
      `insert into ingest_runs (id, source, status, window_from, window_to, upserted, details, started_at, heartbeat_at, finished_at)
       values ($1, $2, 'succeeded', $3, $4, $5, $6::jsonb, $3, now(), now())`,
      [crypto.randomUUID(), NIGHTLY_CATEGORY_RUN_SOURCE, startedAt, deadline, result.categorized, JSON.stringify(result)],
    );
  } catch (error) {
    logger.warn({ err: error }, "Could not record the nightly category run");
  }
}

const withGuard = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Jev call still queued after ${ms} ms`)), ms);
    timer.unref();
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
};

/**
 * One night of local classification: example embeddings, the student over every tender it has
 * not evaluated, and Jev as the teacher of the doubtful ones. Resumable: whatever was written
 * leaves the pending sets, so the next night (or a restart inside the window) picks up the rest.
 */
export async function runNightlyCategoryClassification(options: {
  deadline: Date;
  client?: OllamaClient;
  jev?: JevCategoryTeacher;
  config?: NightlyCategoryConfig;
  statuses?: readonly string[];
  signal?: StopSignal;
  now?: () => Date;
  budgetPaused?: () => Promise<boolean>;
}): Promise<NightlyResult> {
  const config = options.config ?? nightlyCategoryConfig();
  const statuses = [...(options.statuses ?? DEFAULT_CLASSIFY_STATUSES)];
  const signal = options.signal ?? NEVER_STOP;
  const ollama = options.client ?? createOllamaClient();
  const now = options.now ?? (() => new Date());
  const embedModel = ollama.config.embedModel;
  const startedAt = now();
  const until = (limit: Date): StopSignal => ({
    get stopped() {
      return signal.stopped || now().getTime() >= limit.getTime();
    },
  });
  const night = until(options.deadline);
  const client = patientEmbedding(ollama, config.embedRetryDelayMs, night);
  const totals: NightlyTotals = {
    examplesEmbedded: 0, processed: 0, reused: 0, categorized: 0, kept: 0, lowConfidence: 0, jevSent: 0, jevTaught: 0,
    jevRejected: 0, jevFailed: 0, jevInputTokens: 0, jevCostUsd: 0, examplesAdded: 0,
  };
  let jevSkipped: JevSkipReason | null = null;
  let jevFailuresInARow = 0;
  let holdout: NightlyHoldout | null = null;
  let holdoutRecent: NightlyHoldout | null = null;
  /** Vectors of tonight's doubtful titles, reused when Jev turns them into examples. */
  const vectors = new Map<string, Float32Array>();

  const embedExamples = async (limit: Date): Promise<void> => {
    const result = await embedPendingExamples({ client, batch: config.embedChunk, signal: until(limit) });
    totals.examplesEmbedded += result.embedded;
    if (result.embedded > 0) incrementMetric("licitai_nightly_category_examples_embedded_total", {}, result.embedded);
  };

  const finish = async (
    student: CategoryStudent | null,
    skipped: NightlyResult["skipped"],
  ): Promise<NightlyResult> => {
    const backlog = await loadNightlyBacklog({ statuses, embedModel, threshold: config.jev.threshold, now: now() });
    const stopped = night.stopped;
    const result: NightlyResult = {
      ...totals,
      ...backlog,
      complete: !stopped && skipped === null,
      stopped,
      skipped,
      jevSkipped,
      embedModel,
      trainExamples: student?.size ?? 0,
      holdout,
      holdoutRecent,
      durationMs: now().getTime() - startedAt.getTime(),
    };
    setMetric("licitai_nightly_category_pending", backlog.pendingTenders, { kind: "tenders" });
    setMetric("licitai_nightly_category_pending", backlog.pendingExamples, { kind: "examples" });
    setMetric("licitai_nightly_category_pending", backlog.jevBacklog, { kind: "jev" });
    logger.info(result, "Nightly category classification summary");
    await recordNightlyRun(result, startedAt, options.deadline);
    return result;
  };

  const applyJevAnswer = async (tender: TeachCandidate, answer: JevTenderCategory): Promise<void> => {
    const categories = answer.confidence >= config.jev.minConfidence ? jevCategories(answer) : [];
    const costUsd = answer.inputTokens * JEV_USD_PER_INPUT_TOKEN;
    totals.jevInputTokens += answer.inputTokens;
    totals.jevCostUsd += costUsd;
    incrementMetric("licitai_nightly_category_jev_cost_usd_total", {}, costUsd);
    const connection = await pool.connect();
    try {
      await connection.query("begin");
      // Recorded even for a rejected answer: it is what keeps the tender from being asked again.
      await connection.query(
        `insert into ai_title_usage (tender_id, model, input_tokens, output_tokens, estimated_cost_usd)
         values ($1, $2, $3, 0, $4)`,
        [tender.id, `${JEV_TEACHER_USAGE_PREFIX}${answer.model}`, answer.inputTokens, costUsd.toFixed(8)],
      );
      // The official title may have changed while Jev answered; then this answer is stale.
      const current = await connection.query(
        "select 1 from tenders where id = $1 and title = $2 for update",
        [tender.id, tender.title],
      );
      if (categories.length === 0 || (current.rowCount ?? 0) === 0) {
        await connection.query("commit");
        totals.jevRejected += 1;
        incrementMetric("licitai_nightly_category_jev_total", { result: "rejected" });
        return;
      }
      await connection.query(
        `update tenders set categories = $2::jsonb, category_source = 'teacher', category_confidence = $3,
           categorized_at = now(), search_text = $4
         where id = $1`,
        [tender.id, JSON.stringify(toTenderCategories(categories)), answer.confidence,
          buildTenderSearchText(norms(tender), tender.display_title_norm, categories)],
      );
      const vector = vectors.get(textHash(tender.title));
      const added = await insertTitleExample({
        sourceText: tender.title,
        tenderId: tender.id,
        result: { title: null, categories: categories.filter(isTenderCategorySlug), rejection: null },
        teacherModel: answer.model,
        promptVersion: JEV_TEACHER_PROMPT_VERSION,
        embedding: vector ? { vector, model: embedModel } : undefined,
      }, connection);
      await connection.query("commit");
      totals.jevTaught += 1;
      if (added) totals.examplesAdded += 1;
      incrementMetric("licitai_nightly_category_jev_total", { result: "taught" });
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  };

  /** Sends the doubtful tenders to Jev, inside the daily limit and the batch lane of the scheduler. */
  const teach = async (candidates: readonly TeachCandidate[]): Promise<void> => {
    if (candidates.length === 0 || jevSkipped === "unavailable") return;
    if (!config.jev.enabled) {
      jevSkipped = "disabled";
      return;
    }
    const paused = options.budgetPaused ?? (async () => (await import("../ai/ai-budget")).isAiBatchBudgetPaused());
    if (await paused()) {
      jevSkipped = "budget_paused";
      return;
    }
    const remaining = config.jev.dailyLimit - (await jevTeacherCallsToday(now())).calls;
    if (remaining < 1) {
      jevSkipped = "daily_limit";
      return;
    }
    const jev = options.jev ?? (await import("../ai/jev-client")).classifyTenderCategory;
    const queue = candidates.slice(0, remaining);
    if (queue.length < candidates.length) jevSkipped = "daily_limit";
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < queue.length && !night.stopped && jevSkipped !== "unavailable") {
        const tender = queue[next];
        next += 1;
        totals.jevSent += 1;
        try {
          const answer = await withGuard(jev(tender.title), JEV_CALL_GUARD_MS);
          jevFailuresInARow = 0;
          await applyJevAnswer(tender, answer);
        } catch (error) {
          totals.jevFailed += 1;
          jevFailuresInARow += 1;
          incrementMetric("licitai_nightly_category_jev_total", { result: "failed" });
          logger.warn({ err: error, tenderId: tender.id }, "Jev category teacher call failed");
          if (jevFailuresInARow >= JEV_FAILURES_BEFORE_GIVING_UP) jevSkipped = "unavailable";
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(config.jev.concurrency, queue.length) }, worker));
  };

  // (a) Example vectors first, for a share of the night; with too few usable examples the student
  // would only guess, so the whole night goes to the examples instead.
  const exampleDeadline = new Date(Math.min(
    options.deadline.getTime(),
    startedAt.getTime() + config.exampleShare * Math.max(0, options.deadline.getTime() - startedAt.getTime()),
  ));
  await embedExamples(exampleDeadline);
  let { student } = await loadStudent(embedModel);
  if (student.size < config.minExamples && !night.stopped) {
    await embedExamples(options.deadline);
    ({ student } = await loadStudent(embedModel));
  }
  if (student.size === 0) return await finish(student, "no_examples");
  if (!night.stopped) {
    const sample = {
      student, embedModel, threshold: config.jev.threshold, limit: config.holdoutSample, frozenAt: config.holdoutFrozenAt,
    };
    holdout = await evaluateHoldoutSample(sample);
    holdoutRecent = await evaluateHoldoutSample({ ...sample, part: "recent" });
  }

  // (b) The student, newest tenders first, each batch followed by its own doubtful ones: tonight's
  // tenders get the teacher before the backlog does.
  let cursor: { createdAt: string; id: string } | null = null;
  let batchNumber = 0;
  /** Tonight's answers by text hash, so a repeated official title costs one embedding. */
  const predictions = new Map<string, StudentPrediction>();
  while (!night.stopped) {
    const rows: TenderRow[] = (await pool.query<TenderRow>(
      `select ${TENDER_COLUMNS}, t.created_at::text as cursor, ${BIDDABLE} as biddable from tenders t
       where ${STUDENT_PENDING}
         and ($2::timestamptz is null or (t.created_at, t.id) < ($2::timestamptz, $3))
       order by t.created_at desc, t.id desc limit $4`,
      [statuses, cursor?.createdAt ?? null, cursor?.id ?? "", config.batch],
    )).rows;
    if (rows.length === 0) break;
    const batchStartedAt = now().getTime();
    const before = { ...totals };

    // The same official text is embedded once a night, and a text a teacher already labelled
    // is not embedded at all: the example is the answer.
    const hashes = rows.map(({ title }) => textHash(title));
    const labelled = new Map((await pool.query<{ text_hash: string; categories: string[] }>(
      "select text_hash, categories from tender_title_examples where text_hash = any($1::text[]) and cardinality(categories) > 0",
      [[...new Set(hashes)]],
    )).rows.map((row) => [row.text_hash, row.categories]));
    const fresh = new Map<string, string>();
    rows.forEach(({ title }, index) => {
      const hash = hashes[index];
      if (!labelled.has(hash) && !predictions.has(hash)) fresh.set(hash, studentText(title));
    });
    const toEmbed = [...fresh.entries()];
    for (let start = 0; start < toEmbed.length && !night.stopped; start += config.embedChunk) {
      const chunk = toEmbed.slice(start, start + config.embedChunk);
      const { embeddings } = await client.embed(chunk.map(([, text]) => text));
      for (const [index, [hash]] of chunk.entries()) {
        const prediction = student.classify(embeddings[index]);
        predictions.set(hash, prediction);
        if (prediction.confidence < config.jev.threshold && vectors.size < 2 * Math.max(1, config.jev.dailyLimit)) {
          vectors.set(hash, Float32Array.from(embeddings[index]));
        }
        await yieldToEventLoop();
      }
    }

    const doubtful: TeachCandidate[] = [];
    const update = {
      ids: [] as string[], titles: [] as string[], apply: [] as boolean[], categories: [] as string[],
      confidences: [] as number[], searchTexts: [] as string[],
    };
    let last: TenderRow | undefined;
    for (const [index, row] of rows.entries()) {
      const example = labelled.get(hashes[index]);
      const prediction: StudentPrediction | undefined = example
        ? { categories: example.slice(0, 2), confidence: 1, primary: example[0], neighbours: 1 }
        : predictions.get(hashes[index]);
      // The window closed in the middle of the batch: the rest stays pending.
      if (!prediction) break;
      if (!fresh.has(hashes[index])) totals.reused += 1;
      else fresh.delete(hashes[index]);
      last = row;
      const apply = prediction.categories.length > 0;
      update.ids.push(row.id);
      update.titles.push(row.title);
      update.apply.push(apply);
      update.categories.push(JSON.stringify(toTenderCategories(prediction.categories)));
      update.confidences.push(prediction.confidence);
      update.searchTexts.push(buildTenderSearchText(norms(row), row.display_title_norm, prediction.categories));
      if (apply) totals.categorized += 1;
      else totals.kept += 1;
      if (prediction.confidence < config.jev.threshold) {
        totals.lowConfidence += 1;
        if (row.biddable) doubtful.push(row);
      }
    }
    if (!last) break;
    if (predictions.size > MAX_NIGHT_PREDICTIONS) predictions.clear();
    // Below the display minimum the student only records its confidence: a rules category is
    // better than none while Jev has not answered.
    await pool.query(
      `update tenders t set
         categories = case when v.apply then v.categories::jsonb else t.categories end,
         category_source = case when v.apply then 'student' else t.category_source end,
         search_text = case when v.apply then v.search_text else t.search_text end,
         category_confidence = v.confidence,
         categorized_at = now()
       from unnest($1::text[], $2::text[], $3::boolean[], $4::text[], $5::real[], $6::text[])
         as v(id, title, apply, categories, confidence, search_text)
       where t.id = v.id and t.title = v.title and t.category_source is distinct from 'teacher'`,
      [update.ids, update.titles, update.apply, update.categories, update.confidences, update.searchTexts],
    );
    totals.processed += update.ids.length;
    cursor = { createdAt: last.cursor, id: last.id };
    await teach(doubtful);

    batchNumber += 1;
    const batch = {
      batch: batchNumber,
      processed: totals.processed - before.processed,
      reused: totals.reused - before.reused,
      categorized: totals.categorized - before.categorized,
      kept: totals.kept - before.kept,
      lowConfidence: totals.lowConfidence - before.lowConfidence,
      jevSent: totals.jevSent - before.jevSent,
      jevTaught: totals.jevTaught - before.jevTaught,
      jevCostUsd: Number((totals.jevCostUsd - before.jevCostUsd).toFixed(6)),
      durationMs: now().getTime() - batchStartedAt,
    };
    incrementMetric("licitai_nightly_category_tenders_total", { result: "student" }, batch.categorized);
    incrementMetric("licitai_nightly_category_tenders_total", { result: "kept" }, batch.kept);
    incrementMetric("licitai_nightly_category_low_confidence_total", {}, batch.lowConfidence);
    logger.info({ ...batch, jevSkipped, totalProcessed: totals.processed }, "Nightly category batch");
  }

  // (c) With what the daily limit left, doubtful tenders from earlier nights, the newest first.
  if (!night.stopped && config.jev.enabled && config.jev.dailyLimit > 0) {
    await teach((await pool.query<TeachCandidate>(
      `select ${TENDER_COLUMNS} from tenders t where ${JEV_PENDING}
       order by t.created_at desc, t.id desc limit $3`,
      [statuses, config.jev.threshold, config.jev.dailyLimit],
    )).rows);
  }

  // Spare time goes back to the examples the share left behind.
  if (!night.stopped) await embedExamples(options.deadline);
  return await finish(student, null);
}
