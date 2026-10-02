import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
import type { OllamaClient } from "../ai/ollama-client";
import { loadStudent, type LoadedStudent } from "./examples";
import { studentConfig } from "./student";
import { runTeacher } from "./teacher";
import { studentText, textHash } from "./text";

export type GoldFixture = { items: { id: number; text: string; acceptedCategories: string[] }[] };

export const GOLD_FIXTURE_URL = new URL("../../scripts/fixtures/title-eval-gold.json", import.meta.url);

export const readGoldFixture = async (url: URL = GOLD_FIXTURE_URL): Promise<GoldFixture> =>
  JSON.parse(await readFile(url, "utf8")) as GoldFixture;

type Metrics = {
  total: number;
  correct: number;
  accuracy: number;
  covered: number;
  coverage: number;
  correctCovered: number;
  accuracyCovered: number;
};

const metrics = (rows: { correct: boolean; covered: boolean }[]): Metrics => {
  const total = rows.length;
  const correct = rows.filter((row) => row.correct).length;
  const covered = rows.filter((row) => row.covered).length;
  const correctCovered = rows.filter((row) => row.correct && row.covered).length;
  const ratio = (part: number, whole: number) => (whole === 0 ? 0 : Number((part / whole).toFixed(4)));
  return {
    total,
    correct,
    accuracy: ratio(correct, total),
    covered,
    coverage: ratio(covered, total),
    correctCovered,
    accuracyCovered: ratio(correctCovered, covered),
  };
};

export type EvalReport = {
  generatedAt: string;
  embedModel: string;
  k: number;
  minConfidence: number;
  trainExamples: number;
  holdout: Metrics;
  gold: Metrics & {
    items: { id: number; primary: string | null; categories: string[]; confidence: number; accepted: string[]; hit: boolean }[];
  };
  confusions: { teacher: string; student: string; count: number }[];
  teacher?: {
    model: string;
    totalMs: number;
    msPerTitle: number;
    hits: number;
    items: { id: number; title: string | null; categories: string[]; rejection: string | null; hit: boolean }[];
  };
};

/**
 * Student accuracy on the holdout (primary category vs the teacher's) and on the 40 gold titles
 * (primary inside `acceptedCategories`). Gold texts are excluded from the neighbours to avoid leakage.
 */
export async function evaluateStudent(options: {
  client: OllamaClient;
  gold: GoldFixture;
  withTeacher?: boolean;
  loaded?: LoadedStudent;
}): Promise<EvalReport> {
  const config = studentConfig();
  const embedModel = options.client.config.embedModel;
  const { student } = options.loaded ?? await loadStudent(embedModel, config);

  const holdoutRows = (await pool.query<{ categories: string[]; embedding: number[] }>(
    `select categories, embedding from tender_title_examples
     where split = 'holdout' and embedding is not null and embedding_model = $1 and cardinality(categories) > 0
     order by text_hash`,
    [embedModel],
  )).rows;
  const confusionCounts = new Map<string, number>();
  const holdout = holdoutRows.map((row) => {
    const prediction = student.classify(row.embedding);
    const expected = row.categories[0];
    if (prediction.primary && prediction.primary !== expected) {
      const key = `${expected}\u0000${prediction.primary}`;
      confusionCounts.set(key, (confusionCounts.get(key) ?? 0) + 1);
    }
    return { correct: prediction.primary === expected, covered: prediction.categories.length > 0 };
  });

  const goldHashes = new Set(options.gold.items.map(({ text }) => textHash(text)));
  const { embeddings } = await options.client.embed(options.gold.items.map(({ text }) => studentText(text)));
  const goldItems = options.gold.items.map((item, index) => {
    const prediction = student.classify(embeddings[index], { excludeHashes: goldHashes });
    return {
      id: item.id,
      primary: prediction.primary,
      categories: prediction.categories,
      confidence: Number(prediction.confidence.toFixed(4)),
      accepted: item.acceptedCategories,
      hit: prediction.primary !== null && item.acceptedCategories.includes(prediction.primary),
    };
  });

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    embedModel,
    k: config.k,
    minConfidence: config.minConfidence,
    trainExamples: student.size,
    holdout: metrics(holdout),
    gold: {
      ...metrics(goldItems.map((item) => ({ correct: item.hit, covered: item.categories.length > 0 }))),
      items: goldItems,
    },
    confusions: [...confusionCounts.entries()]
      .map(([key, count]) => {
        const [teacher, studentCategory] = key.split("\u0000");
        return { teacher, student: studentCategory, count };
      })
      .sort((a, b) => b.count - a.count || a.teacher.localeCompare(b.teacher) || a.student.localeCompare(b.student))
      .slice(0, 10),
  };

  if (options.withTeacher) {
    const run = await runTeacher(options.gold.items.map(({ text }) => text), options.client);
    const items = options.gold.items.map((item, index) => {
      const result = run.results[index];
      return {
        id: item.id,
        title: result?.title ?? null,
        categories: result?.categories ?? [],
        rejection: result?.rejection ?? "missing",
        hit: result?.categories[0] !== undefined && item.acceptedCategories.includes(result.categories[0]),
      };
    });
    report.teacher = {
      model: run.model,
      totalMs: Math.round(run.durationMs),
      msPerTitle: Math.round(run.durationMs / Math.max(1, items.length)),
      hits: items.filter(({ hit }) => hit).length,
      items,
    };
  }
  return report;
}
