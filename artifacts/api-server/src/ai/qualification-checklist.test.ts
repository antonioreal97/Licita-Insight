import assert from "node:assert/strict";
import { test } from "node:test";
import {
  QUALIFICATION_TYPE_CONFIDENCE_THRESHOLD,
  qualificationSearchQuery,
  segmentQualificationPage,
  stitchIndexedPage,
} from "./qualification-checklist-policy";
import { classifyQualificationCandidate } from "./jev-client";

test("segments real extracted-page shapes on numbered and lettered edital items", () => {
  const page = [
    "7. HABILITAÇÃO",
    "7.3 Regularidade fiscal: prova de inscrição no CNPJ.",
    "7.4.1. Qualificação técnica: atestado de capacidade técnica.",
    "a) registro da empresa no CREA;",
    "b) registro do responsável técnico no CAU.",
  ].join("\n");

  assert.deepEqual(segmentQualificationPage(page), [
    "7. HABILITAÇÃO",
    "7.3 Regularidade fiscal: prova de inscrição no CNPJ.",
    "7.4.1. Qualificação técnica: atestado de capacidade técnica.",
    "a) registro da empresa no CREA;",
    "b) registro do responsável técnico no CAU.",
  ]);
});

test("reassembles the overlapping stored passage shape before segmentation", () => {
  const first =
    "6. DAS PROPOSTAS regras gerais 7.3 Regularidade fiscal mediante certidão negativa e prova de inscrição";
  const second =
    "7.3 Regularidade fiscal mediante certidão negativa e prova de inscrição 7.4 Qualificação técnica mediante atestado de capacidade";
  const stitched = stitchIndexedPage([
    { order: 1, text: second },
    { order: 0, text: first },
  ]);

  assert.equal(
    stitched,
    "6. DAS PROPOSTAS regras gerais 7.3 Regularidade fiscal mediante certidão negativa e prova de inscrição 7.4 Qualificação técnica mediante atestado de capacidade",
  );
  assert.deepEqual(segmentQualificationPage(stitched), [
    "6. DAS PROPOSTAS regras gerais",
    "7.3 Regularidade fiscal mediante certidão negativa e prova de inscrição",
    "7.4 Qualificação técnica mediante atestado de capacidade",
  ]);
});

test("uses the fixed Portuguese qualification vocabulary for the tsvector shortlist", () => {
  const query = qualificationSearchQuery();
  assert.match(query, /habilitação/);
  assert.match(query, /"regularidade trabalhista"/);
  assert.match(query, /"ato constitutivo"/);
  assert.match(query, /CREA/);
});

test("Jev rejects habilitação outside document-requirement context in the real response shape", async () => {
  process.env.JEV_API_KEY = "test-key";
  let calls = 0;
  const mockedFetch: typeof fetch = async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as {
      state: Record<string, string>;
      questions: Record<string, { type: string; criteria?: Record<string, string> }>;
    };
    assert.deepEqual(Object.keys(body.state), ["trecho_do_edital"]);
    assert.equal(
      body.state.trecho_do_edital,
      "Aquisição e habilitação do dispositivo eletrônico (TAG).",
    );
    assert.deepEqual(Object.keys(body.questions), ["is_req", "tipo"]);
    assert.equal(body.questions.is_req?.type, "noul");
    assert.equal(body.questions.tipo?.type, "choice");
    assert.ok(body.questions.tipo?.criteria?.nao_e_requisito);
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers: {
          is_req: { type: "noul", noul: 0.05 },
          tipo: {
            type: "choice",
            choice: "nao_e_requisito",
            confidence: 0.99,
            probabilities: {},
          },
        },
        usage: { input_tokens: 70, output_tokens: 0 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await classifyQualificationCandidate(
    "Aquisição e habilitação do dispositivo eletrônico (TAG).",
    mockedFetch,
  );
  assert.equal(calls, 1);
  assert.equal(result.isRequirement, 0.05);
  assert.equal(result.type, "nao_e_requisito");
  assert.equal(result.mentionsLaborInAdditionToFiscal, null);
});

test("low-confidence fiscal plus CNDT runs the second Noul with the real response shape", async () => {
  process.env.JEV_API_KEY = "test-key";
  const bodies: unknown[] = [];
  const mockedFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      questions: Record<string, { type: string }>;
    };
    bodies.push(body);
    if (bodies.length === 1) {
      return new Response(
        JSON.stringify({
          model: "jev-1.13.0",
          answers: {
            is_req: { type: "noul", noul: 0.89 },
            tipo: {
              type: "choice",
              choice: "regularidade_fiscal",
              confidence: 0.61,
              probabilities: {},
            },
          },
          usage: { input_tokens: 90, output_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    assert.deepEqual(Object.keys(body.questions), [
      "trabalhista_alem_fiscal",
    ]);
    assert.equal(body.questions.trabalhista_alem_fiscal?.type, "noul");
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers: {
          trabalhista_alem_fiscal: { type: "noul", noul: 0.96 },
        },
        usage: { input_tokens: 45, output_tokens: 0 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await classifyQualificationCandidate(
    "7.3 Prova de regularidade perante o FGTS e CNDT.",
    mockedFetch,
  );
  assert.equal(QUALIFICATION_TYPE_CONFIDENCE_THRESHOLD, 0.7);
  assert.equal(bodies.length, 2);
  assert.equal(result.type, "regularidade_fiscal");
  assert.equal(result.typeConfidence, 0.61);
  assert.equal(result.mentionsLaborInAdditionToFiscal, 0.96);
  assert.equal(result.inputTokens, 135);
});
