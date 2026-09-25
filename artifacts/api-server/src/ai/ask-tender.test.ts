import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { aiDailyLimit, aiQuotaResetsAt, completedIndexStatus, lexicalSearchQuery, selectEvidencePassages } from "./policy";
import { scoreCompanyFit, scoreTenderPassage } from "./jev-client";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

test("applies the evidence threshold, sorts and limits passages", () => {
  const candidates = [0, 1, 2, 3].map((index) => ({
    documentId: `d${index}`,
    documentTitle: "Edital",
    documentUrl: "https://example.test/edital.pdf",
    page: index + 1,
    text: `Trecho ${index}`,
  }));
  const scores = [0.49, 0.97, 0.75, 0.6].map((relevance) => ({ relevance, model: "jev-1.13.0", inputTokens: 10 }));
  assert.deepEqual(selectEvidencePassages(candidates, scores, 0.5).map(({ relevance }) => relevance), [0.97, 0.75, 0.6]);
  assert.equal(selectEvidencePassages(candidates, scores, 0.99).length, 0);
  assert.deepEqual(
    selectEvidencePassages(candidates, scores, 0.5, 0.25).map(({ relevance }) => relevance),
    [0.97, 0.75],
  );
});

test("uses separate trial and paid limits", () => {
  process.env.AI_DAILY_ASK_LIMIT_TRIAL = "4";
  process.env.AI_DAILY_ASK_LIMIT_PAID = "40";
  assert.equal(aiDailyLimit("trial"), 4);
  assert.equal(aiDailyLimit("subscription"), 40);
  assert.equal(aiDailyLimit("dev"), 40);
});

test("keeps an index retryable when any document extraction fails", () => {
  assert.equal(completedIndexStatus(1, 1, 1), "failed");
  assert.equal(completedIndexStatus(1, 1, 0), "ready");
  assert.equal(completedIndexStatus(0, 2, 0), "unsupported");
  assert.equal(completedIndexStatus(0, 0, 0), "failed");
});

test("quota resets at midnight in America/Sao_Paulo", () => {
  assert.equal(aiQuotaResetsAt(new Date("2026-09-25T23:00:00.000Z")), "2026-09-26T03:00:00.000Z");
  assert.equal(aiQuotaResetsAt(new Date("2026-09-26T03:00:00.000Z")), "2026-09-27T03:00:00.000Z");
});

test("builds a Portuguese OR query for broad shortlist recall", () => {
  assert.equal(
    lexicalSearchQuery("É permitida a participação de empresas em consórcio?"),
    "permitida OR participação OR empresas OR consórcio",
  );
});

test("Jev client uses explicit key and parses a mocked noul response", async () => {
  process.env.JEV_API_KEY = "test-key";
  process.env.JEV_MODEL = "jev-1.13.0";
  const mockedFetch: typeof fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-key");
    return new Response(JSON.stringify({
      model: "jev-1.13.0",
      answers: { responde: { type: "noul", noul: 0.91 } },
      usage: { input_tokens: 123, output_tokens: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  assert.deepEqual(await scoreTenderPassage("Qual o prazo?", "O prazo é de 3 dias.", mockedFetch), {
    relevance: 0.91,
    model: "jev-1.13.0",
    inputTokens: 123,
  });
});

test("company fit uses one Jev request for score and optional exclusion", async () => {
  process.env.JEV_API_KEY = "test-key";
  let calls = 0;
  const mockedFetch: typeof fetch = async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string }> };
    assert.equal(body.questions.aderencia?.type, "score");
    assert.equal(body.questions.excluido?.type, "noul");
    return new Response(JSON.stringify({
      model: "jev-1.13.0",
      answers: {
        aderencia: { type: "score", score: 2.7, confidence: 0.9, legend: {}, probabilities: {} },
        excluido: { type: "noul", noul: 0.12 },
      },
      usage: { input_tokens: 321, output_tokens: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  assert.deepEqual(await scoreCompanyFit({
    description: "Fornecemos servidores e suporte.",
    offerings: ["servidores"],
    exclusions: ["obra civil"],
    tenderText: "Aquisição de servidores.",
  }, mockedFetch), {
    fitScore: 2.7,
    excludedProbability: 0.12,
    model: "jev-1.13.0",
    inputTokens: 321,
  });
  assert.equal(calls, 1);
});
