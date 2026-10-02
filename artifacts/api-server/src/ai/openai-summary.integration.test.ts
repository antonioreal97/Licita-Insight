import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";

test("ask caches an OpenAI summary and the sheet worker records both summary ledger features", {
  skip: !process.env.PNCP_TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const schema = `openai_summary_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.APP_ROLE = "worker";
  process.env.JEV_API_KEY = "test-jev-key";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_MODEL = "gpt-4o-mini";
  process.env.AI_DAILY_BUDGET_USD = "10";
  process.env.LOG_LEVEL = "silent";

  const {
    aiAskRequestsTable,
    aiSheetDailyUsageTable,
    db,
    pool,
    subscriptionsTable,
    tenderAiDocumentsTable,
    tenderAiIndexesTable,
    tenderAiPassagesTable,
    tenderAiSheetsTable,
    tendersTable,
    usersTable,
  } = await import("@workspace/db");
  await pool.query(`create schema "${schema}"`);
  for (const table of [
    "users",
    "subscriptions",
    "tenders",
    "saved_tenders",
    "tender_ai_indexes",
    "tender_ai_documents",
    "tender_ai_passages",
    "ai_daily_usage",
    "ai_fit_daily_usage",
    "ai_sheet_daily_usage",
    "ai_ask_requests",
    "tender_ai_sheets",
    "ai_jobs",
  ]) {
    await pool.query(`create table "${schema}"."${table}" (like public."${table}" including all)`);
  }
  await pool.query(`
    create view ai_usage_ledger as
      select created_at as occurred_at, user_id, 'ask'::text as feature,
             tender_id, response_model as model, input_tokens, 0::integer as output_tokens,
             estimated_cost_usd as cost_usd
      from ai_ask_requests where status in ('answered', 'not_found')
      union all
      select created_at, user_id, 'ask_summary'::text, tender_id, summary_response_model,
             summary_input_tokens, summary_output_tokens, summary_estimated_cost_usd
      from ai_ask_requests
      where summary_input_tokens > 0 or summary_output_tokens > 0 or summary_estimated_cost_usd > 0
      union all
      select generated_at, null::text, 'sheet_summary'::text, tender_id, summary_response_model,
             summary_input_tokens, summary_output_tokens, summary_estimated_cost_usd
      from tender_ai_sheets
      where generated_at is not null
        and (summary_input_tokens > 0 or summary_output_tokens > 0 or summary_estimated_cost_usd > 0)
  `);

  const tenderId = `T-${randomUUID()}`;
  const userId = `U-${randomUUID()}`;
  const documentId = `D-${randomUUID()}`;
  const documents = [{
    id: "source-1",
    name: "edital.pdf",
    type: "application/pdf",
    sizeBytes: null,
    url: "https://pncp.gov.br/edital.pdf",
    publishedAt: null,
  }];
  const sourceFingerprint = createHash("sha256").update(JSON.stringify({
    extractorVersion: 3,
    documents: documents.map(({ id, name, url: documentUrl, sizeBytes, publishedAt }) => ({
      id,
      name,
      url: documentUrl,
      sizeBytes,
      publishedAt,
    })),
  })).digest("hex");
  const originalFetch = globalThis.fetch;
  let jevCalls = 0;
  let askSummaryCalls = 0;
  let sheetSummaryCalls = 0;
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      questions?: Record<string, { type: string }>;
      response_format?: { json_schema?: { name?: string } };
    };
    if (String(input).endsWith("/chat/completions")) {
      const name = body.response_format?.json_schema?.name ?? "";
      if (name.startsWith("ask_summary")) {
        askSummaryCalls += 1;
        return new Response(JSON.stringify({
          model: "gpt-4o-mini-2024-07-18",
          choices: [{ message: { content: '{"answer":"O prazo de entrega é de dez dias [1].","citations":[1]}' } }],
          usage: { prompt_tokens: 120, completion_tokens: 18 },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      sheetSummaryCalls += 1;
      return new Response(JSON.stringify({
        model: "gpt-4o-mini-2024-07-18",
        choices: [{ message: { content: '{"summary":"A entrega ocorre em dez dias [1]. O prazo consta no edital [1].","citations":[1]}' } }],
        usage: { prompt_tokens: 150, completion_tokens: 24 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    jevCalls += 1;
    const answers = Object.fromEntries(Object.entries(body.questions ?? {}).map(([key, question]) => [
      key,
      question.type === "choice"
        ? { type: "choice", choice: "not_defined", confidence: 0.95, probabilities: {} }
        : { type: "noul", noul: 0.96 },
    ]));
    return new Response(JSON.stringify({
      model: "jev-1.13.0",
      answers,
      usage: { input_tokens: 90, output_tokens: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    await db.insert(usersTable).values({ id: userId, email: `${userId}@example.test` });
    await db.insert(subscriptionsTable).values({ userId, status: "active", currentPeriodEnd: new Date("2099-01-01") });
    await db.insert(tendersTable).values({
      id: tenderId,
      pncpControlNumber: tenderId,
      title: "Edital com prazo de entrega",
      organizationId: "ORG",
      organizationName: "Órgão de teste",
      modality: "other",
      modalityLabel: "Outra",
      status: "open",
      estimatedValueStatus: "not_published",
      sourceId: tenderId,
      sourceName: "TEST",
      categories: [],
      items: [],
      documents,
      timeline: [],
      searchText: "prazo entrega",
      titleNorm: "edital prazo entrega",
      objectNorm: "",
      itemsNorm: "",
      organizationNorm: "orgao teste",
      otherNorm: "",
      rawPayload: {},
      fetchedAt: new Date(),
    });
    await db.insert(tenderAiIndexesTable).values({
      tenderId,
      version: 1,
      sourceFingerprint,
      status: "ready",
      completedAt: new Date(),
    });
    await db.insert(tenderAiDocumentsTable).values({
      id: documentId,
      tenderId,
      sourceDocumentId: "source-1",
      title: "Edital.pdf",
      sourceUrl: documents[0]!.url,
      pages: 1,
      status: "ready",
    });
    await db.insert(tenderAiPassagesTable).values({
      id: `P-${randomUUID()}`,
      tenderId,
      documentId,
      indexVersion: 1,
      page: 1,
      passageOrder: 0,
      text: "O prazo de entrega é de dez dias corridos após a assinatura.",
    });

    const { askTender } = await import("./ask-tender-service");
    const first = await askTender(userId, tenderId, "Qual é o prazo de entrega?");
    const cached = await askTender(userId, tenderId, "Qual é o prazo de entrega?");
    assert.equal(first.status, "answered");
    assert.deepEqual(cached.summary, first.summary);
    assert.equal(jevCalls, 1);
    assert.equal(askSummaryCalls, 1);
    const [askRow] = await db.select().from(aiAskRequestsTable).where(eq(aiAskRequestsTable.tenderId, tenderId));
    assert.equal(askRow?.summary?.citations[0], 1);

    const notFound = await askTender(userId, tenderId, "Existe cronograma de vacinação animal?");
    assert.equal(notFound.status, "not_found");
    assert.equal(notFound.summary, null);
    assert.equal(askSummaryCalls, 1);

    const { SHEET_PROMPT_VERSION } = await import("./tender-sheet-policy");
    const { dateInSaoPaulo } = await import("../lib/sao-paulo-date");
    const sheetId = `S-${randomUUID()}`;
    await db.insert(aiSheetDailyUsageTable).values({ quotaDay: dateInSaoPaulo(new Date()) });
    await db.insert(tenderAiSheetsTable).values({
      id: sheetId,
      tenderId,
      indexVersion: 1,
      requestedModel: "jev-1.13.0",
      promptVersion: SHEET_PROMPT_VERSION,
      summaryRequestedModel: "gpt-4o-mini",
      status: "processing",
      unreadDocuments: 0,
    });
    const { executeTenderSheetJob } = await import("./tender-sheet-service");
    await executeTenderSheetJob(sheetId, tenderId);
    const [sheet] = await db.select().from(tenderAiSheetsTable).where(eq(tenderAiSheetsTable.id, sheetId));
    assert.equal(sheet?.status, "ready");
    assert.ok(sheet?.summary);
    assert.equal(sheetSummaryCalls, 1);

    const ledger = await pool.query<{ feature: string; input_tokens: number; output_tokens: number }>(
      "select feature, input_tokens, output_tokens from ai_usage_ledger order by feature",
    );
    assert.deepEqual(ledger.rows.map(({ feature }) => feature), ["ask", "ask_summary", "sheet_summary"]);
    assert.equal(Number(ledger.rows.find(({ feature }) => feature === "ask_summary")?.output_tokens), 18);
    assert.equal(Number(ledger.rows.find(({ feature }) => feature === "sheet_summary")?.output_tokens), 24);
  } finally {
    globalThis.fetch = originalFetch;
    await pool.query(`drop schema "${schema}" cascade`);
    await pool.end();
  }
});
