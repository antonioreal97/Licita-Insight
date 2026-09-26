import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { TenderSheetEvidence, TenderSheetFieldId } from "@workspace/db";
import { aiConfig } from "./config";
import { classifySheetField, scoreSheetPassage } from "./jev-client";
import {
  buildSheetFields,
  SHEET_FIELDS,
  SHEET_PROMPT_VERSION,
  sheetCacheKey,
} from "./tender-sheet-policy";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

const evidence = (
  page: number,
  text = "A participação em consórcio é permitida.",
): TenderSheetEvidence => ({
  documentTitle: "Edital.pdf",
  documentUrl: "https://pncp.gov.br/edital.pdf",
  page,
  text,
});

test("returns all 13 fields and never converts absence into a negative answer", () => {
  const { fields } = buildSheetFields({}, {}, 0.5, 0.6);
  assert.equal(fields.length, 13);
  assert.deepEqual(
    fields.map(({ id }) => id),
    SHEET_FIELDS.map(({ id }) => id),
  );
  assert.ok(
    fields.every(
      (field) =>
        field.status === "not_found" &&
        field.answer === null &&
        field.evidence === null,
    ),
  );
});

test("keeps below-threshold evidence not_found and returns page-backed evidence above it", () => {
  const { fields, diagnostics } = buildSheetFields(
    {
      consortium: [
        { noul: 0.49, evidence: evidence(2) },
        { noul: 0.31, evidence: evidence(3) },
      ],
      penalties: [
        {
          noul: 0.91,
          evidence: evidence(20, "Multa de 10% sobre o valor contratado."),
        },
        {
          noul: 0.72,
          evidence: evidence(21, "Outras penalidades aplicáveis."),
        },
      ],
    },
    {},
    0.5,
    0.6,
  );
  assert.equal(
    fields.find(({ id }) => id === "consortium")?.status,
    "not_found",
  );
  assert.deepEqual(
    fields.find(({ id }) => id === "penalties"),
    {
      id: "penalties",
      status: "found",
      answer: null,
      confidence: 0.91,
      evidence: evidence(20, "Multa de 10% sobre o valor contratado."),
    },
  );
  assert.equal(
    diagnostics.find(({ id }) => id === "penalties")?.secondNoul,
    0.72,
  );
});

test("Choice not_defined or low confidence preserves found evidence with null answer", () => {
  const candidates = {
    consortium: [{ noul: 0.9, evidence: evidence(4) }],
    site_visit: [
      {
        noul: 0.88,
        evidence: evidence(9, "A vistoria será tratada no item 10."),
      },
    ],
  };
  const { fields } = buildSheetFields(
    candidates,
    {
      consortium: { answer: "not_defined", confidence: 0.98 },
      site_visit: { answer: "waived", confidence: 0.59 },
    },
    0.5,
    0.6,
  );
  for (const id of [
    "consortium",
    "site_visit",
  ] satisfies TenderSheetFieldId[]) {
    const field = fields.find((candidate) => candidate.id === id);
    assert.equal(field?.status, "found");
    assert.equal(field?.answer, null);
    assert.ok(field?.evidence);
  }
});

test("cache key is global across users and invalidates on index, model, or prompt", () => {
  const first = sheetCacheKey("tender-1", 1, "jev-1.13.0", 1);
  assert.equal(first, sheetCacheKey("tender-1", 1, "jev-1.13.0", 1));
  assert.notEqual(first, sheetCacheKey("tender-1", 2, "jev-1.13.0", 1));
  assert.notEqual(first, sheetCacheKey("tender-1", 1, "jev-next", 1));
  assert.notEqual(first, sheetCacheKey("tender-1", 1, "jev-1.13.0", 2));
});

test("guarantees use explicit required/not_required/not_defined choices in prompt version 2", () => {
  assert.equal(SHEET_PROMPT_VERSION, 2);
  for (const id of [
    "bid_guarantee",
    "contract_guarantee",
  ] satisfies TenderSheetFieldId[]) {
    const spec = SHEET_FIELDS.find((field) => field.id === id);
    assert.deepEqual(Object.keys(spec?.choices ?? {}), [
      "required",
      "not_required",
      "not_defined",
    ]);
    assert.match(spec?.choices?.not_required ?? "", /expressamente/);
  }
});

test("sheet daily limit is configurable and defaults to 500", () => {
  delete process.env.AI_DAILY_SHEET_LIMIT;
  assert.equal(aiConfig().sheetDailyLimit, 500);
  process.env.AI_DAILY_SHEET_LIMIT = "7";
  assert.equal(aiConfig().sheetDailyLimit, 7);
});

test("Jev sheet scoring fans out one Noul per candidate field in one request", async () => {
  process.env.JEV_API_KEY = "test-key";
  let calls = 0;
  const mockedFetch: typeof fetch = async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as {
      state: Record<string, unknown>;
      questions: Record<string, { type: string }>;
    };
    assert.deepEqual(Object.keys(body.state), ["trecho_do_edital"]);
    assert.deepEqual(Object.keys(body.questions), ["consortium", "penalties"]);
    assert.ok(
      Object.values(body.questions).every(({ type }) => type === "noul"),
    );
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers: {
          consortium: { type: "noul", noul: 0.94 },
          penalties: { type: "noul", noul: 0.11 },
        },
        usage: { input_tokens: 80, output_tokens: 0 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const result = await scoreSheetPassage(
    "Trecho oficial",
    ["consortium", "penalties"],
    mockedFetch,
  );
  assert.equal(calls, 1);
  assert.deepEqual(result.scores, { consortium: 0.94, penalties: 0.11 });
  assert.equal(result.inputTokens, 80);
});

test("Jev Choice uses the exact enum only after a best categorical passage exists", async () => {
  process.env.JEV_API_KEY = "test-key";
  const mockedFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      questions: { answer: { type: string; criteria: Record<string, string> } };
    };
    assert.equal(body.questions.answer.type, "choice");
    assert.deepEqual(Object.keys(body.questions.answer.criteria), [
      "allowed",
      "forbidden",
      "not_defined",
    ]);
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers: {
          answer: {
            type: "choice",
            choice: "forbidden",
            confidence: 0.97,
            probabilities: {},
          },
        },
        usage: { input_tokens: 40, output_tokens: 0 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  assert.deepEqual(
    await classifySheetField(
      "consortium",
      "É vedada a participação em consórcio.",
      mockedFetch,
    ),
    {
      answer: "forbidden",
      confidence: 0.97,
      model: "jev-1.13.0",
      inputTokens: 40,
    },
  );
});

test("Jev Choice classifies both guarantees without inferring not_required from absence", async () => {
  process.env.JEV_API_KEY = "test-key";
  for (const [id, passage, answer] of [
    [
      "bid_guarantee",
      "23.1. Não será exigida garantia da proposta.",
      "not_required",
    ],
    [
      "contract_guarantee",
      "A contratada prestará garantia de execução de 5%.",
      "required",
    ],
  ] as const) {
    const mockedFetch: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        state: Record<string, string>;
        questions: {
          answer: { type: string; criteria: Record<string, string> };
        };
      };
      assert.deepEqual(Object.keys(body.state), ["trecho_do_edital"]);
      assert.equal(body.state.trecho_do_edital, passage);
      assert.deepEqual(Object.keys(body.questions.answer.criteria), [
        "required",
        "not_required",
        "not_defined",
      ]);
      assert.match(
        body.questions.answer.criteria.not_required ?? "",
        /expressamente/,
      );
      return new Response(
        JSON.stringify({
          model: "jev-1.13.0",
          answers: {
            answer: {
              type: "choice",
              choice: answer,
              confidence: 0.99,
              probabilities: {},
            },
          },
          usage: { input_tokens: 42, output_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    assert.equal(
      (await classifySheetField(id, passage, mockedFetch)).answer,
      answer,
    );
  }
});
