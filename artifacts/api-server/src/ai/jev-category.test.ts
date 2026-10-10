import assert from "node:assert/strict";
import test from "node:test";
import { TENDER_CATEGORIES } from "../catalog/tender-categories";
import { classifyTenderCategory, JevUnavailableError } from "./jev-client";

test("o professor Jev escolhe uma categoria da lista oficial com Choice", async () => {
  process.env.JEV_API_KEY = "test-key";
  const slugs = TENDER_CATEGORIES.map(({ slug }) => slug);
  const mockedFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      state: { objeto_da_licitacao: string };
      questions: Record<string, { type: string; criteria: Record<string, string> }>;
    };
    assert.deepEqual(Object.keys(body.questions), ["categoria"]);
    assert.equal(body.questions.categoria?.type, "choice");
    assert.deepEqual(Object.keys(body.questions.categoria?.criteria ?? {}), slugs, "a mesma lista do professor atual");
    assert.equal(body.questions.categoria?.criteria["alimentacao"], "Alimentação");
    assert.equal(body.state.objeto_da_licitacao.length, 600, "título longo é cortado");
    assert.ok(body.state.objeto_da_licitacao.startsWith("Serviço de buffet"));
    return new Response(JSON.stringify({
      model: "jev-1.13.0",
      answers: {
        categoria: {
          type: "choice", choice: "alimentacao", confidence: 0.81,
          probabilities: { alimentacao: 0.81, "eventos-cultura": 0.12 },
        },
      },
      usage: { input_tokens: 410, output_tokens: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  assert.deepEqual(await classifyTenderCategory(`Serviço   de buffet ${"x".repeat(700)}`, mockedFetch), {
    category: "alimentacao",
    confidence: 0.81,
    probabilities: { alimentacao: 0.81, "eventos-cultura": 0.12 },
    model: "jev-1.13.0",
    inputTokens: 410,
  });
});

test("falha do Jev vira JevUnavailableError para o job noturno contar e seguir", async () => {
  process.env.JEV_API_KEY = "test-key";
  const failing: typeof fetch = async () => new Response("{}", { status: 400 });
  await assert.rejects(classifyTenderCategory("Aquisição de pneus", failing), JevUnavailableError);
});
