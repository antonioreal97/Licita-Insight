import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import type { TenderSheetField } from "@workspace/db";

test("ask caches its summary and existing sheets refresh only their OpenAI summary", {
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
    aiDailyUsageTable,
    aiSheetDailyUsageTable,
    db,
    pool,
    subscriptionsTable,
    tenderAiDocumentsTable,
    tenderAiAnswersTable,
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
    "ai_title_usage",
    "ai_ask_requests",
    "tender_ai_answers",
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
      from ai_ask_requests where status in ('answered', 'not_found') and cache_hit = false
      union all
      select created_at, user_id, 'ask_summary'::text, tender_id, summary_response_model,
             summary_input_tokens, summary_output_tokens, summary_estimated_cost_usd
      from ai_ask_requests
      where summary_input_tokens > 0 or summary_output_tokens > 0 or summary_estimated_cost_usd > 0
      union all
      select summary_generated_at, null::text, 'sheet_summary'::text, tender_id, summary_response_model,
             summary_input_tokens, summary_output_tokens, summary_estimated_cost_usd
      from tender_ai_sheets
      where summary_generated_at is not null
        and (summary_input_tokens > 0 or summary_output_tokens > 0 or summary_estimated_cost_usd > 0)
  `);

  const tenderId = `T-${randomUUID()}`;
  const userId = `U-${randomUUID()}`;
  const secondUserId = `U-${randomUUID()}`;
  const thirdUserId = `U-${randomUUID()}`;
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
        model: process.env.OPENAI_MODEL,
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
    await db.insert(usersTable).values({ id: secondUserId, email: `${secondUserId}@example.test` });
    await db.insert(usersTable).values({ id: thirdUserId, email: `${thirdUserId}@example.test` });
    await db.insert(subscriptionsTable).values({ userId, status: "active", currentPeriodEnd: new Date("2099-01-01") });
    await db.insert(subscriptionsTable).values({ userId: secondUserId, status: "active", currentPeriodEnd: new Date("2099-01-01") });
    await db.insert(subscriptionsTable).values({ userId: thirdUserId, status: "active", currentPeriodEnd: new Date("2099-01-01") });
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
    const shared = await askTender(secondUserId, tenderId, "  QUAL É O PRAZO DE ENTREGA?  ");
    assert.equal(shared.status, "answered");
    assert.deepEqual(shared.summary, first.summary);
    assert.equal(shared.quota.used, 0);
    assert.equal(jevCalls, 1);
    assert.equal(askSummaryCalls, 1);
    const [sharedHistory] = await db.select().from(aiAskRequestsTable)
      .where(eq(aiAskRequestsTable.userId, secondUserId));
    assert.equal(sharedHistory?.cacheHit, true);
    const [secondUsage] = await db.select().from(aiDailyUsageTable)
      .where(eq(aiDailyUsageTable.userId, secondUserId));
    assert.equal(secondUsage, undefined);
    await db.delete(tenderAiAnswersTable).where(eq(tenderAiAnswersTable.tenderId, tenderId));
    const seeded = await askTender(thirdUserId, tenderId, "Qual é o prazo de entrega?");
    assert.equal(seeded.status, "answered");
    assert.deepEqual(seeded.summary, first.summary);
    assert.equal(seeded.quota.used, 0);
    assert.equal(jevCalls, 1);
    assert.equal(askSummaryCalls, 1);

    const beforeConcurrent = jevCalls;
    const concurrent = await Promise.all([
      askTender(userId, tenderId, "Qual é o prazo da entrega?"),
      askTender(secondUserId, tenderId, "Qual é o prazo da entrega?"),
    ]);
    assert.equal(jevCalls, beforeConcurrent + 1);
    assert.ok(concurrent.every(({ status }) => status === "answered" || status === "processing"));
    assert.equal((await askTender(thirdUserId, tenderId, "Qual é o prazo da entrega?")).status, "answered");
    assert.equal(jevCalls, beforeConcurrent + 1);
    const jevBeforeSummaryChange = jevCalls;
    process.env.OPENAI_MODEL = "gpt-4o-mini-alt";
    const resummarizedAsk = await askTender(thirdUserId, tenderId, "Qual é o prazo de entrega?");
    assert.equal(resummarizedAsk.status, "answered");
    assert.deepEqual(resummarizedAsk.summary?.citations, [1]);
    assert.equal(resummarizedAsk.quota.used, 0);
    assert.equal(jevCalls, jevBeforeSummaryChange);
    assert.equal(askSummaryCalls, 3);
    process.env.OPENAI_MODEL = "gpt-4o-mini";
    const [askRow] = await db.select().from(aiAskRequestsTable).where(eq(aiAskRequestsTable.tenderId, tenderId));
    assert.equal(askRow?.summary?.citations[0], 1);

    const notFound = await askTender(userId, tenderId, "Existe cronograma de vacinação animal?");
    assert.equal(notFound.status, "not_found");
    assert.equal(notFound.summary, null);
    assert.equal(askSummaryCalls, 3);

    const { SHEET_PROMPT_VERSION } = await import("./tender-sheet-policy");
    const { SHEET_SUMMARY_PROMPT_VERSION } = await import("./openai-summary");
    const { dateInSaoPaulo } = await import("../lib/sao-paulo-date");
    const { getTenderSheet } = await import("./tender-sheet-service");
    const { runEnqueuedAiJobNow } = await import("./ai-job-queue");
    const sheetId = `S-${randomUUID()}`;
    const fields = [{
      id: "delivery_term",
      status: "found",
      answer: null,
      confidence: 0.96,
      evidence: {
        documentTitle: "Edital.pdf",
        documentUrl: documents[0]!.url,
        page: 1,
        text: "O prazo de entrega é de dez dias corridos após a assinatura.",
      },
    }] satisfies TenderSheetField[];
    const quotaDay = dateInSaoPaulo(new Date());
    await db.insert(aiSheetDailyUsageTable).values({
      quotaDay,
      used: 1,
      inputTokens: 90,
      estimatedCostUsd: "0.00000378",
    });
    await db.insert(tenderAiSheetsTable).values({
      id: sheetId,
      tenderId,
      indexVersion: 1,
      requestedModel: "jev-1.13.0",
      promptVersion: SHEET_PROMPT_VERSION,
      status: "ready",
      fields,
      unreadDocuments: 0,
      responseModel: "jev-1.13.0",
      inputTokens: 90,
      estimatedCostUsd: "0.00000378",
      generatedAt: new Date(),
    });

    const jevCallsBeforeSheet = jevCalls;
    const [firstSheetRead, concurrentSheetRead] = await Promise.all([
      getTenderSheet(tenderId, userId),
      getTenderSheet(tenderId, userId),
    ]);
    assert.equal(firstSheetRead.status, "ready");
    assert.equal(firstSheetRead.summary, null);
    assert.deepEqual(firstSheetRead.fields, fields);
    assert.deepEqual(concurrentSheetRead.fields, fields);
    assert.equal(jevCalls, jevCallsBeforeSheet);
    const queued = await pool.query<{ dedupe_key: string; status: string }>(
      "select dedupe_key, status from ai_jobs where kind = 'sheet_summary' order by created_at",
    );
    assert.equal(queued.rowCount, 1);
    assert.equal(queued.rows[0]?.status, "queued");
    assert.equal(await runEnqueuedAiJobNow(queued.rows[0]!.dedupe_key), true);

    const summarized = await getTenderSheet(tenderId, userId);
    assert.ok(summarized.summary);
    assert.deepEqual(summarized.fields, fields);
    assert.equal(sheetSummaryCalls, 1);
    assert.equal(jevCalls, jevCallsBeforeSheet);

    process.env.OPENAI_MODEL = "gpt-4o-mini-next";
    const changedModel = await getTenderSheet(tenderId, userId);
    assert.equal(changedModel.summary, null);
    assert.deepEqual(changedModel.fields, fields);
    const modelJobs = await pool.query<{ dedupe_key: string }>(
      "select dedupe_key from ai_jobs where kind = 'sheet_summary' order by created_at",
    );
    assert.equal(modelJobs.rowCount, 2);
    assert.equal(await runEnqueuedAiJobNow(modelJobs.rows[1]!.dedupe_key), true);
    const resummarized = await getTenderSheet(tenderId, userId);
    assert.ok(resummarized.summary);
    assert.deepEqual(resummarized.fields, fields);
    assert.equal(sheetSummaryCalls, 2);
    assert.equal(jevCalls, jevCallsBeforeSheet);

    const [usage] = await db.select().from(aiSheetDailyUsageTable)
      .where(eq(aiSheetDailyUsageTable.quotaDay, quotaDay));
    assert.equal(usage?.inputTokens, 90);
    assert.equal(usage?.estimatedCostUsd, "0.00000378");

    await pool.query("update ai_daily_usage set estimated_cost_usd = 0");
    await pool.query("update ai_fit_daily_usage set estimated_cost_usd = 0");
    await pool.query("update ai_sheet_daily_usage set estimated_cost_usd = 0");
    process.env.AI_DAILY_BUDGET_USD = "0.00003";
    const { refreshAiBudgetState } = await import("./ai-budget");
    const budget = await refreshAiBudgetState(true);
    assert.equal(budget.ask, 0);
    assert.equal(budget.fit, 0);
    assert.ok(budget.sheet >= 0.0000369);
    assert.equal(budget.paused, true);

    process.env.OPENAI_MODEL = "gpt-4o-mini-budget-paused";
    const pausedRead = await getTenderSheet(tenderId, userId);
    assert.equal(pausedRead.summary, null);
    const pausedJobs = await pool.query<{ dedupe_key: string }>(
      "select dedupe_key from ai_jobs where kind = 'sheet_summary' order by created_at",
    );
    assert.equal(pausedJobs.rowCount, 3);
    assert.equal(await runEnqueuedAiJobNow(pausedJobs.rows[2]!.dedupe_key), true);
    assert.equal(sheetSummaryCalls, 2);
    assert.equal((await getTenderSheet(tenderId, userId)).summary, null);

    const noKeyTenderId = `T-${randomUUID()}`;
    const noKeySheetId = `S-${randomUUID()}`;
    await db.insert(tendersTable).values({
      id: noKeyTenderId,
      pncpControlNumber: noKeyTenderId,
      title: "Edital sem resumo",
      organizationId: "ORG",
      organizationName: "Órgão de teste",
      modality: "other",
      modalityLabel: "Outra",
      status: "open",
      estimatedValueStatus: "not_published",
      sourceId: noKeyTenderId,
      sourceName: "TEST",
      categories: [],
      items: [],
      documents,
      timeline: [],
      searchText: "prazo entrega",
      titleNorm: "edital sem resumo",
      objectNorm: "",
      itemsNorm: "",
      organizationNorm: "orgao teste",
      otherNorm: "",
      rawPayload: {},
      fetchedAt: new Date(),
    });
    await db.insert(tenderAiIndexesTable).values({
      tenderId: noKeyTenderId,
      version: 1,
      sourceFingerprint,
      status: "ready",
      completedAt: new Date(),
    });
    await db.insert(tenderAiSheetsTable).values({
      id: noKeySheetId,
      tenderId: noKeyTenderId,
      indexVersion: 1,
      requestedModel: "jev-1.13.0",
      promptVersion: SHEET_PROMPT_VERSION,
      status: "ready",
      fields,
      unreadDocuments: 0,
      responseModel: "jev-1.13.0",
      generatedAt: new Date(),
    });
    delete process.env.OPENAI_API_KEY;
    const jobsBeforeNoKey = await pool.query<{ count: number }>(
      "select count(*)::int as count from ai_jobs where kind = 'sheet_summary'",
    );
    const withoutKey = await getTenderSheet(noKeyTenderId, userId);
    assert.equal(withoutKey.summary, null);
    const jobsAfterNoKey = await pool.query<{ count: number }>(
      "select count(*)::int as count from ai_jobs where kind = 'sheet_summary'",
    );
    assert.equal(jobsAfterNoKey.rows[0]?.count, jobsBeforeNoKey.rows[0]?.count);

    const ledger = await pool.query<{ feature: string; input_tokens: number; output_tokens: number }>(
      "select feature, input_tokens, output_tokens from ai_usage_ledger order by feature",
    );
    assert.deepEqual(ledger.rows.map(({ feature }) => feature), ["ask", "ask", "ask_summary", "ask_summary", "ask_summary", "sheet_summary"]);
    assert.equal(Number(ledger.rows.find(({ feature }) => feature === "ask_summary")?.output_tokens), 18);
    assert.equal(Number(ledger.rows.find(({ feature }) => feature === "sheet_summary")?.output_tokens), 24);
    const [storedSheet] = await db.select().from(tenderAiSheetsTable)
      .where(eq(tenderAiSheetsTable.id, sheetId));
    assert.equal(storedSheet?.promptVersion, 3);
    assert.equal(storedSheet?.summaryPromptVersion, SHEET_SUMMARY_PROMPT_VERSION);
    assert.equal(storedSheet?.summaryRequestedModel, "gpt-4o-mini-budget-paused");
    assert.equal(storedSheet?.summary, null);
  } finally {
    globalThis.fetch = originalFetch;
    await pool.query(`drop schema "${schema}" cascade`);
    await pool.end();
  }
});
