// Offline evaluation of the recommendation ranking from recommendation_impressions. Read-only.
//
//   pnpm --filter @workspace/api-server run evaluate:recommendations
//   pnpm --filter @workspace/api-server run evaluate:recommendations -- --days 60 --window 14 --k 10
//   pnpm --filter @workspace/api-server run evaluate:recommendations -- --weights pesos.json --json
//
// --weights takes a JSON object of score parts → multiplier ({"novelty": 0, "interest": 1.5}); a missing part keeps 1.
// Without it, only the production order (baseline) is measured. --include-open counts impressions whose outcome
// window has not closed yet (they look like misses until then).
import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
import {
  evaluateRanking,
  loadImpressionLists,
  type FeatureWeights,
  type RankingSummary,
} from "../src/recommendations/offline-evaluation";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const positiveInteger = (name: string, fallback: number): number => {
  const value = Number(arg(name) ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

const days = positiveInteger("--days", 30);
const windowDays = positiveInteger("--window", 14);
const k = positiveInteger("--k", 10);
const weightsPath = arg("--weights");
const weights = weightsPath
  ? (JSON.parse(await readFile(weightsPath, "utf8")) as FeatureWeights)
  : undefined;
if (weights && Object.values(weights).some((value) => typeof value !== "number" || !Number.isFinite(value)))
  throw new Error("--weights must map score parts to finite numbers");

const line = (label: string, summary: RankingSummary): string =>
  `${label.padEnd(10)} precision@${k} ${summary.precisionAtK.toFixed(4)}  hit@${k} ${summary.hitRateAtK.toFixed(4)}  ` +
  `nDCG@${k} ${summary.ndcgAtK === null ? "  —   " : summary.ndcgAtK.toFixed(4)}  ` +
  `negativos no top ${summary.negativesInTopK}  (listas com positivo: ${summary.listsWithPositives})`;

try {
  const lists = await loadImpressionLists({
    days,
    windowDays,
    includeOpenWindow: process.argv.includes("--include-open"),
  });
  const report = evaluateRanking(lists, { k, weights });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ days, windowDays, weights: weights ?? null, ...report }, null, 2));
  } else {
    console.log(
      `${report.lists} listas, ${report.impressions} impressões (${days} dias, janela de ${windowDays}); ` +
        `${report.positives} positivas, ${report.negatives} negativas; versões ${JSON.stringify(report.byAlgorithmVersion)}`,
    );
    console.log(line("produção", report.baseline));
    if (report.variant) console.log(line("variante", report.variant));
    if (report.positives === 0)
      console.log("Sem desfechos positivos no período: ainda não há base para comparar pesos.");
  }
} finally {
  await pool.end();
}
