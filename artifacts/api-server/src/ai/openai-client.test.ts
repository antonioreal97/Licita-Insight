import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { AiPassageRecord } from "@workspace/db";
import { OpenAiUnavailableError, completeJson } from "./openai-client";
import { generateAskSummary, generateSheetSummary } from "./openai-summary";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

const passage: AiPassageRecord = {
  documentId: "D1",
  documentTitle: "Edital.pdf",
  documentUrl: "https://pncp.gov.br/edital.pdf",
  page: 7,
  text: "O prazo de entrega é de dez dias corridos.",
  relevance: 0.97,
};

const completion = (content: string, status = 200) => new Response(JSON.stringify({
  model: "gpt-4o-mini-2024-07-18",
  choices: [{ message: { content } }],
  usage: { prompt_tokens: 100, completion_tokens: 20 },
}), { status, headers: { "content-type": "application/json" } });

test("uses Chat Completions structured output without storing and calculates both token prices", async () => {
  process.env.OPENAI_API_KEY = "test-openai-key";
  let calls = 0;
  const requestFetch: typeof fetch = async (input, init) => {
    calls += 1;
    assert.equal(String(input), "https://api.openai.com/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-openai-key");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.store, false);
    assert.equal(body.temperature, 0.1);
    assert.equal((body.response_format as { type: string }).type, "json_schema");
    return completion('{"answer":"O prazo é de dez dias [1].","citations":[1]}');
  };
  const result = await generateAskSummary("Qual é o prazo?", [passage], {
    requestFetch,
    budgetPaused: async () => false,
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.summary, {
    text: "O prazo é de dez dias [1].",
    citations: [1],
    model: "gpt-4o-mini-2024-07-18",
  });
  assert.equal(result.inputTokens, 100);
  assert.equal(result.outputTokens, 20);
  assert.equal(result.costUsd, 0.000027);
});

test("discards an out-of-range citation while preserving billable usage", async () => {
  process.env.OPENAI_API_KEY = "test-openai-key";
  const result = await generateAskSummary("Qual é o prazo?", [passage], {
    requestFetch: async () => completion('{"answer":"O prazo é de dez dias [2].","citations":[2]}'),
    budgetPaused: async () => false,
  });
  assert.equal(result.summary, null);
  assert.equal(result.inputTokens, 100);
  assert.equal(result.outputTokens, 20);
});

test("discards invalid JSON while preserving billable usage", async () => {
  process.env.OPENAI_API_KEY = "test-openai-key";
  const result = await generateAskSummary("Qual é o prazo?", [passage], {
    requestFetch: async () => completion("not json"),
    budgetPaused: async () => false,
  });
  assert.equal(result.summary, null);
  assert.equal(result.costUsd, 0.000027);
});

test("does not call OpenAI without a key, with an open circuit breaker, or without answered passages", async () => {
  let calls = 0;
  const requestFetch: typeof fetch = async () => {
    calls += 1;
    return completion('{"answer":null,"citations":[]}');
  };
  delete process.env.OPENAI_API_KEY;
  assert.equal((await generateAskSummary("Pergunta", [passage], { requestFetch, budgetPaused: async () => false })).summary, null);
  process.env.OPENAI_API_KEY = "test-openai-key";
  assert.equal((await generateAskSummary("Pergunta", [passage], { requestFetch, budgetPaused: async () => true })).summary, null);
  assert.equal((await generateAskSummary("Pergunta", [], { requestFetch, budgetPaused: async () => false })).summary, null);
  assert.equal(calls, 0);
});

test("aborts on timeout and never calls the real API", async () => {
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_TIMEOUT_MS = "1";
  const requestFetch: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  await assert.rejects(
    completeJson({ name: "timeout", schema: { type: "object" }, system: "s", user: "u", requestFetch }),
    (error: unknown) => error instanceof OpenAiUnavailableError && /timed out/u.test(error.message),
  );
});

test("retries one time after HTTP 429 and accepts a two-sentence sheet summary", async () => {
  process.env.OPENAI_API_KEY = "test-openai-key";
  let calls = 0;
  const requestFetch: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response("rate limited", { status: 429 });
    return completion('{"summary":"A entrega ocorre em dez dias [1]. Confira os demais requisitos no edital [1].","citations":[1]}');
  };
  const result = await generateSheetSummary([
    {
      id: "delivery_term",
      status: "found",
      answer: null,
      confidence: 0.95,
      evidence: {
        documentTitle: passage.documentTitle,
        documentUrl: passage.documentUrl,
        page: passage.page,
        text: passage.text,
      },
    },
  ], [], { requestFetch, budgetPaused: async () => false });
  assert.equal(calls, 2);
  assert.ok(result.summary);
  assert.deepEqual(result.summary?.citations, [1]);
});
