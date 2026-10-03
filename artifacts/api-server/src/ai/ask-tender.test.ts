import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { aiDailyLimit, aiQuotaResetsAt, askSearchQueries, completedIndexStatus, mergeAskShortlists, selectEvidencePassages } from "./policy";
import { scoreCompanyFit, scoreSizeRestriction, scoreTenderPassage } from "./jev-client";
import { generateAskSummary } from "./openai-summary";

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

test("publishes a partial index when at least one document is readable", () => {
  assert.equal(completedIndexStatus(1, 1, 1), "ready");
  assert.equal(completedIndexStatus(1, 1, 0), "ready");
  assert.equal(completedIndexStatus(0, 0, 1), "failed");
  assert.equal(completedIndexStatus(0, 2, 1), "failed");
  assert.equal(completedIndexStatus(0, 2, 0), "unsupported");
  assert.equal(completedIndexStatus(0, 0, 0), "failed");
});

test("quota resets at midnight in America/Sao_Paulo", () => {
  assert.equal(aiQuotaResetsAt(new Date("2026-09-25T23:00:00.000Z")), "2026-09-26T03:00:00.000Z");
  assert.equal(aiQuotaResetsAt(new Date("2026-09-26T03:00:00.000Z")), "2026-09-27T03:00:00.000Z");
});

test("searches the question and domain synonyms before Jev judges the passages", () => {
  const queries = askSearchQueries("Há vistoria obrigatória?");
  assert.equal(queries[0], "vistoria obrigatoria");
  assert.match(queries[1] ?? "", /visita técnica/u);
  assert.equal(queries.at(-1), "vistoria OR obrigatoria");
  assert.deepEqual(askSearchQueries("Qual é o prazo?"), ["prazo"]);
});

test("interleaves matching routes without repeating the same edital page", () => {
  const candidate = (page: number, text: string) => ({
    documentId: "edital",
    documentTitle: "Edital.pdf",
    documentUrl: "https://example.test/edital.pdf",
    page,
    text,
  });
  assert.deepEqual(mergeAskShortlists([
    [candidate(1, "A"), candidate(1, "B"), candidate(1, "C")],
    [candidate(1, "A"), candidate(2, "D"), candidate(3, "E")],
  ], 4).map(({ text }) => text), ["A", "B", "D", "E"]);
});

test("OpenAI writes a short answer with a real passage citation and a supported schema", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  const passage = {
    documentId: "edital",
    documentTitle: "Edital.pdf",
    documentUrl: "https://example.test/edital.pdf",
    page: 3,
    text: "A visita técnica é facultativa e pode ser substituída por declaração.",
    relevance: 0.93,
  };
  const requestFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>;
      response_format: { json_schema: { schema: { properties: { citations: Record<string, unknown> } } } };
      store: boolean;
    };
    assert.equal(body.store, false);
    assert.equal(body.response_format.json_schema.schema.properties.citations.uniqueItems, undefined);
    assert.match(body.messages[0]?.content ?? "", /linguagem clara e natural/u);
    assert.match(body.messages[1]?.content ?? "", /A visita técnica é facultativa/u);
    return new Response(JSON.stringify({
      model: "gpt-4o-mini",
      choices: [{ message: { content: '{"answer":"A visita técnica é facultativa; você pode substituí-la por uma declaração [1].","citations":[1]}' } }],
      usage: { prompt_tokens: 50, completion_tokens: 20 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await generateAskSummary("Preciso fazer vistoria?", [passage], {
    budgetPaused: async () => false,
    requestFetch,
  });
  assert.equal(result.summary?.citations[0], 1);
  assert.match(result.summary?.text ?? "", /facultativa/u);
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
    const body = JSON.parse(String(init?.body)) as {
      questions: Record<string, { type: string; instructions: string; criteria?: Record<string, string> }>;
    };
    assert.equal(body.questions.aderencia?.type, "score");
    assert.equal(body.questions.exclusao_0?.type, "noul");
    assert.equal(body.questions.exclusao_1?.type, "noul");
    assert.match(body.questions.aderencia?.instructions ?? "", /licitacao.*perfil_da_empresa/);
    assert.match(body.questions.exclusao_0?.instructions ?? "", /objeto principal/);
    assert.match(body.questions.exclusao_0?.criteria?.false ?? "", /insumo/);
    return new Response(JSON.stringify({
      model: "jev-1.13.0",
      answers: {
        aderencia: { type: "score", score: 2.7, confidence: 0.9, legend: {}, probabilities: {} },
        exclusao_0: { type: "noul", noul: 0.91 },
        exclusao_1: { type: "noul", noul: 0.12 },
      },
      usage: { input_tokens: 321, output_tokens: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  assert.deepEqual(await scoreCompanyFit({
    description: "Fornecemos servidores e suporte.",
    offerings: ["servidores"],
    exclusions: ["obra civil", "medicamentos"],
    tenderText: "Aquisição de servidores.",
  }, mockedFetch), {
    fitScore: 2.7,
    exclusions: [
      { term: "obra civil", probability: 0.91 },
      { term: "medicamentos", probability: 0.12 },
    ],
    model: "jev-1.13.0",
    inputTokens: 321,
  });
  assert.equal(calls, 1);
});

test("classifica exclusividade, cota, benefício e trecho misto com Choice", async () => {
  process.env.JEV_API_KEY = "test-key";
  const cases = [
    ["Participação exclusiva para ME/EPP neste lote.", "exclusive"],
    ["Cota reservada de 25% para ME/EPP; a cota principal é ampla.", "quota"],
    ["Será assegurada preferência pós-lances para ME/EPP.", "none"],
    ["Há cota em outro lote, mas este item é exclusivo para ME/EPP.", "exclusive"],
  ] as const;
  for (const [passage, expected] of cases) {
    const mockedFetch: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string; criteria: Record<string, string> }> };
      assert.equal(body.questions.restricao?.type, "choice");
      assert.deepEqual(Object.keys(body.questions.restricao?.criteria ?? {}), ["exclusive", "quota", "none"]);
      return new Response(JSON.stringify({
        model: "jev-1.13.0",
        answers: { restricao: { type: "choice", choice: expected, confidence: 0.93, probabilities: {} } },
        usage: { input_tokens: 50, output_tokens: 0 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    assert.deepEqual(await scoreSizeRestriction(passage, mockedFetch), {
      restriction: expected, confidence: 0.93, model: "jev-1.13.0", inputTokens: 50,
    });
  }
});
