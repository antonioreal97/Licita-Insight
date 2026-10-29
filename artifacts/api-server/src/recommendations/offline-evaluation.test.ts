import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const {
  evaluateRanking,
  listMetrics,
  outcomeGain,
  rerank,
  weightedScore,
} = await import("./offline-evaluation");

const none = { clicked: false, interest: false, saved: false, monitored: false, advanced: false, dismissed: false };

test("o desfecho mais forte define o ganho; dispensa sozinha não pontua", () => {
  assert.equal(outcomeGain(none), 0);
  assert.equal(outcomeGain({ ...none, clicked: true }), 1);
  assert.equal(outcomeGain({ ...none, clicked: true, monitored: true }), 3);
  assert.equal(outcomeGain({ ...none, saved: true, advanced: true }), 4);
  assert.equal(outcomeGain({ ...none, dismissed: true }), 0);
});

const item = (tenderId: string, position: number, features: Record<string, number>, gain = 0, negative = false) => ({
  tenderId,
  position,
  features,
  gain,
  negative,
});

test("pesos vazios reproduzem a soma; pesos mudam a ordem e empates seguem a tela", () => {
  const a = item("a", 1, { profileTerms: 10, novelty: 6 });
  const b = item("b", 2, { profileTerms: 14 });
  const c = item("c", 3, { profileTerms: 14 });
  assert.equal(weightedScore(a.features, {}), 16);
  assert.deepEqual(rerank([a, b, c], {}).map((x) => x.tenderId), ["a", "b", "c"]);
  assert.deepEqual(rerank([c, b, a], { novelty: 0 }).map((x) => x.tenderId), ["b", "c", "a"]);
});

test("precision, hit e nDCG no top k; lista sem positivo não entra no nDCG", () => {
  const ordered = [item("a", 1, {}, 0, true), item("b", 2, {}, 2), item("c", 3, {}, 0)];
  const metrics = listMetrics(ordered, 2);
  assert.equal(metrics.precision, 0.5);
  assert.equal(metrics.hit, true);
  assert.equal(metrics.negatives, 1);
  assert.ok(metrics.ndcg !== null && metrics.ndcg > 0 && metrics.ndcg < 1);
  assert.equal(listMetrics([item("x", 1, {}, 2)], 10).ndcg, 1);
  assert.equal(listMetrics([item("x", 1, {})], 10).ndcg, null);
});

test("a variante que sobe o positivo melhora o nDCG frente à ordem de produção", () => {
  const list = {
    userId: "u",
    scope: "all",
    generatedAt: "2026-10-01T03:00:00.000Z",
    algorithmVersion: 2,
    items: [
      item("ruim", 1, { profileTerms: 20, novelty: 6 }),
      item("bom", 2, { profileTerms: 18, interest: 4 }, 2),
    ],
  };
  const report = evaluateRanking([list], { k: 1, weights: { interest: 3 } });
  assert.equal(report.impressions, 2);
  assert.equal(report.positives, 1);
  assert.deepEqual(report.byAlgorithmVersion, { "2": 1 });
  assert.equal(report.baseline.precisionAtK, 0);
  assert.equal(report.variant?.precisionAtK, 1);
  assert.ok((report.variant?.ndcgAtK ?? 0) > (report.baseline.ndcgAtK ?? 0));
  assert.equal(evaluateRanking([list], { k: 1 }).variant, null);
});
