import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  aiSheetDailyUsageTable,
  db,
  tenderAiDocumentsTable,
  tenderAiIndexesTable,
  tenderAiSheetsTable,
  type AiGeneratedSummary,
  type QualificationItem,
  type TenderSheetDiagnostic,
  type TenderSheetField,
  type TenderSheetFieldId,
} from "@workspace/db";
import { AiQuotaExceededError, AiUnavailableError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { ensureTenderIndex } from "./ask-tender-service";
import { aiConfig, openAiConfig } from "./config";
import { reserveTenderConsultation } from "./tender-quota";
import {
  classifyQualificationCandidate,
  classifySheetField,
  scoreSheetPassage,
} from "./jev-client";
import {
  buildSheetFields,
  SHEET_FIELDS,
  SHEET_PROMPT_VERSION,
  sheetCacheKey,
  sheetSearchQuery,
  type SheetChoice,
  type SheetScoredCandidate,
} from "./tender-sheet-policy";
import { enqueueAiJob, runEnqueuedAiJobNow } from "./ai-job-queue";
import { appRoleFromEnv } from "../app-role";
import {
  buildQualificationChecklist,
  isQualificationCandidateText,
  qualificationSearchQuery,
  segmentQualificationPage,
  stitchIndexedPage,
  type QualificationScoredCandidate,
} from "./qualification-checklist-policy";
import {
  generateSheetSummary,
  SHEET_SUMMARY_PROMPT_VERSION,
  type SummaryAttempt,
} from "./openai-summary";

type SheetStatus =
  | "not_started"
  | "processing"
  | "ready"
  | "failed"
  | "no_documents"
  | "unsupported"
  | "expired";

export type TenderSheetResponse = {
  status: SheetStatus;
  fields: TenderSheetField[];
  qualificationChecklist: QualificationItem[];
  summary: AiGeneratedSummary | null;
  unreadDocuments: number;
  model: string | null;
  generatedAt: string | null;
};

const EMPTY_SUMMARY_ATTEMPT: SummaryAttempt = {
  summary: null,
  model: null,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
};

async function safelyGenerateSheetSummary(
  fields: TenderSheetField[],
  qualificationChecklist: QualificationItem[],
): Promise<SummaryAttempt> {
  try {
    return await generateSheetSummary(fields, qualificationChecklist);
  } catch (error) {
    logger.warn({ err: error }, "OpenAI tender-sheet summary was discarded");
    return EMPTY_SUMMARY_ATTEMPT;
  }
}

type TenderAiSheetRow = typeof tenderAiSheetsTable.$inferSelect;
type SummaryConfig = ReturnType<typeof openAiConfig>;

const sheetSummaryDedupeKey = (
  sheetId: string,
  model: string,
  promptVersion: number,
) => `sheet_summary:${sheetId}:${model}:v${promptVersion}`;

const summaryStateIsCurrent = (
  sheet: TenderAiSheetRow,
  config: SummaryConfig,
): boolean =>
  sheet.summaryPromptVersion === SHEET_SUMMARY_PROMPT_VERSION &&
  sheet.summaryRequestedModel === config.model;

async function enqueueMissingSheetSummary(
  sheet: TenderAiSheetRow,
  config: SummaryConfig,
): Promise<void> {
  if (!config.apiKey || summaryStateIsCurrent(sheet, config)) return;
  const dedupeKey = sheetSummaryDedupeKey(
    sheet.id,
    config.model,
    SHEET_SUMMARY_PROMPT_VERSION,
  );
  try {
    await enqueueAiJob({
      kind: "sheet_summary",
      dedupeKey,
      tenderId: sheet.tenderId,
      userId: null,
      payload: {
        sheetId: sheet.id,
        model: config.model,
        promptVersion: SHEET_SUMMARY_PROMPT_VERSION,
      },
      lane: "batch",
      maxAttempts: 1,
    });
    if (appRoleFromEnv() === "all") void runEnqueuedAiJobNow(dedupeKey);
  } catch (error) {
    logger.warn({ err: error, sheetId: sheet.id }, "Tender-sheet summary enqueue failed");
  }
}

async function readySheetResponse(
  sheet: TenderAiSheetRow,
  config: SummaryConfig,
): Promise<TenderSheetResponse> {
  const current = summaryStateIsCurrent(sheet, config);
  if (!current) await enqueueMissingSheetSummary(sheet, config);
  return {
    status: "ready",
    fields: sheet.fields,
    qualificationChecklist: sheet.qualificationChecklist,
    summary: current ? sheet.summary : null,
    unreadDocuments: sheet.unreadDocuments,
    model: sheet.responseModel ?? sheet.requestedModel,
    generatedAt: sheet.generatedAt?.toISOString() ?? null,
  };
}

export type TenderSheetCalculation = {
  fields: TenderSheetField[];
  diagnostics: TenderSheetDiagnostic[];
  qualificationChecklist: QualificationItem[];
  model: string;
  inputTokens: number;
};

export type TenderQualificationCalculation = {
  qualificationChecklist: QualificationItem[];
  diagnostics: TenderSheetDiagnostic[];
  candidates: QualificationScoredCandidate[];
  model: string;
  inputTokens: number;
};

type Candidate = {
  id: string;
  documentTitle: string;
  documentUrl: string;
  page: number;
  text: string;
  context?: string;
};

type QualificationPageRow = {
  documentId: string;
  documentTitle: string;
  documentUrl: string;
  page: number;
  passageOrder: number;
  text: string;
};

const EMPTY_RESPONSE = (
  status: SheetStatus,
  unreadDocuments: number,
): TenderSheetResponse => ({
  status,
  fields: [],
  qualificationChecklist: [],
  summary: null,
  unreadDocuments,
  model: null,
  generatedAt: null,
});

async function unreadDocumentCount(tenderId: string): Promise<number> {
  const documents = await db
    .select({ status: tenderAiDocumentsTable.status })
    .from(tenderAiDocumentsTable)
    .where(eq(tenderAiDocumentsTable.tenderId, tenderId));
  return documents.filter(
    ({ status }) => status === "failed" || status === "unsupported",
  ).length;
}

async function reserveDailySheet(now: Date): Promise<void> {
  const day = dateInSaoPaulo(now);
  const limit = aiConfig().sheetDailyLimit;
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`ai-sheet:${day}`}))`,
    );
    const [usage] = await tx
      .select({ used: aiSheetDailyUsageTable.used })
      .from(aiSheetDailyUsageTable)
      .where(eq(aiSheetDailyUsageTable.quotaDay, day))
      .limit(1);
    if ((usage?.used ?? 0) >= limit) {
      throw new AiQuotaExceededError(
        "The daily tender-sheet generation limit has been reached",
      );
    }
    await tx
      .insert(aiSheetDailyUsageTable)
      .values({ quotaDay: day, used: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: aiSheetDailyUsageTable.quotaDay,
        set: { used: sql`${aiSheetDailyUsageTable.used} + 1`, updatedAt: now },
      });
  });
}

async function shortlistField(
  tenderId: string,
  indexVersion: number,
  fieldId: TenderSheetFieldId,
): Promise<Candidate[]> {
  const queryText = sheetSearchQuery(fieldId);
  const result = await db.execute<Candidate>(sql`
    select p.id, d.title as "documentTitle", d.source_url as "documentUrl", p.page, p.text
    from tender_ai_passages p
    join tender_ai_documents d on d.id = p.document_id,
         websearch_to_tsquery('portuguese', ${queryText}) query
    where p.tender_id = ${tenderId}
      and p.index_version = ${indexVersion}
      and p.search_vector @@ query
    order by ts_rank_cd(p.search_vector, query) desc, p.page asc
    limit ${aiConfig().sheetCandidateLimit}
  `);
  return result.rows;
}

async function shortlistQualificationCandidates(
  tenderId: string,
  indexVersion: number,
): Promise<Candidate[]> {
  const limit = aiConfig().qualificationCandidateLimit;
  const queryText = qualificationSearchQuery();
  const result = await db.execute<QualificationPageRow>(sql`
    with matching_pages as (
      select p.document_id, p.page,
             max(ts_rank_cd(p.search_vector, query)) as rank
      from tender_ai_passages p,
           websearch_to_tsquery('portuguese', ${queryText}) query
      where p.tender_id = ${tenderId}
        and p.index_version = ${indexVersion}
        and p.search_vector @@ query
      group by p.document_id, p.page
      order by rank desc, p.page asc
      limit ${limit}
    )
    select p.document_id as "documentId", d.title as "documentTitle",
           d.source_url as "documentUrl", p.page,
           p.passage_order as "passageOrder", p.text
    from matching_pages m
    join tender_ai_passages p
      on p.document_id = m.document_id and p.page = m.page
    join tender_ai_documents d on d.id = p.document_id
    where p.tender_id = ${tenderId}
      and p.index_version = ${indexVersion}
    order by m.rank desc, p.document_id, p.page, p.passage_order
  `);
  const pages = new Map<
    string,
    { metadata: QualificationPageRow; passages: QualificationPageRow[] }
  >();
  for (const row of result.rows) {
    const key = `${row.documentId}:${row.page}`;
    const page = pages.get(key) ?? { metadata: row, passages: [] };
    page.passages.push(row);
    pages.set(key, page);
  }
  const candidates: Candidate[] = [];
  for (const [pageKey, page] of pages) {
    const pageText = stitchIndexedPage(
      page.passages.map(({ passageOrder: order, text }) => ({ order, text })),
    );
    let numberedContext: string | undefined;
    for (const [segmentIndex, text] of segmentQualificationPage(pageText).entries()) {
      const numbered = /^\d{1,2}(?:\.\d{1,2}){0,3}\.?\s/u.test(text);
      const lettered = /^[a-z]\)\s/iu.test(text);
      const context = numberedContext;
      if (numbered) numberedContext = text;
      if (
        !isQualificationCandidateText(text) &&
        !(lettered && numberedContext && isQualificationCandidateText(numberedContext))
      ) {
        continue;
      }
      candidates.push({
        id: `${pageKey}:${segmentIndex}`,
        documentTitle: page.metadata.documentTitle,
        documentUrl: page.metadata.documentUrl,
        page: page.metadata.page,
        text,
        context: lettered ? numberedContext : numbered ? context : undefined,
      });
      if (candidates.length >= limit) return candidates;
    }
  }
  return candidates;
}

export async function calculateQualificationChecklist(
  tenderId: string,
  indexVersion: number,
): Promise<TenderQualificationCalculation> {
  const config = aiConfig();
  const candidates = await shortlistQualificationCandidates(
    tenderId,
    indexVersion,
  );
  const scored: QualificationScoredCandidate[] = [];
  let inputTokens = 0;
  let model = config.model;
  const results = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      result: await classifyQualificationCandidate(
        candidate.text,
        undefined,
        candidate.context,
      ),
    })),
  );
  for (const { candidate, result } of results) {
    inputTokens += result.inputTokens;
    model = result.model;
    scored.push({
      evidence: {
        documentTitle: candidate.documentTitle,
        documentUrl: candidate.documentUrl,
        page: candidate.page,
        text: candidate.text,
      },
      isRequirement: result.isRequirement,
      type: result.type,
      typeConfidence: result.typeConfidence,
      mentionsLaborInAdditionToFiscal:
        result.mentionsLaborInAdditionToFiscal,
    });
  }
  const built = buildQualificationChecklist(scored);
  return {
    qualificationChecklist: built.items,
    diagnostics: built.diagnostics,
    candidates: scored,
    model,
    inputTokens,
  };
}

export async function calculateTenderSheet(
  tenderId: string,
  indexVersion: number,
): Promise<TenderSheetCalculation> {
  const config = aiConfig();
  const [shortlists, qualification] = await Promise.all([
    Promise.all(
      SHEET_FIELDS.map(async ({ id }) => ({
        id,
        candidates: await shortlistField(tenderId, indexVersion, id),
      })),
    ),
    calculateQualificationChecklist(tenderId, indexVersion),
  ]);
  const grouped = new Map<
    string,
    { candidate: Candidate; fieldIds: TenderSheetFieldId[] }
  >();
  for (const shortlist of shortlists) {
    for (const candidate of shortlist.candidates) {
      const current = grouped.get(candidate.id) ?? { candidate, fieldIds: [] };
      current.fieldIds.push(shortlist.id);
      grouped.set(candidate.id, current);
    }
  }

  const scored = await Promise.all(
    [...grouped.values()].map(async ({ candidate, fieldIds }) => ({
      candidate,
      fieldIds,
      result: await scoreSheetPassage(candidate.text, fieldIds),
    })),
  );
  const candidates: Partial<
    Record<TenderSheetFieldId, SheetScoredCandidate[]>
  > = {};
  let inputTokens = 0;
  let responseModel = config.model;
  for (const { candidate, fieldIds, result } of scored) {
    inputTokens += result.inputTokens;
    responseModel = result.model;
    for (const fieldId of fieldIds) {
      const list = candidates[fieldId] ?? [];
      list.push({
        noul: result.scores[fieldId] ?? 0,
        evidence: {
          documentTitle: candidate.documentTitle,
          documentUrl: candidate.documentUrl,
          page: candidate.page,
          text: candidate.text,
        },
      });
      candidates[fieldId] = list;
    }
  }

  const choices: Partial<Record<TenderSheetFieldId, SheetChoice>> = {};
  const categorical = SHEET_FIELDS.filter(({ id, choices: criteria }) => {
    const best = [...(candidates[id] ?? [])].sort((a, b) => b.noul - a.noul)[0];
    return criteria && best && best.noul >= config.sheetEvidenceThreshold;
  });
  const classifications = await Promise.all(
    categorical.map(async ({ id }) => {
      const best = [...(candidates[id] ?? [])].sort(
        (a, b) => b.noul - a.noul,
      )[0]!;
      return { id, result: await classifySheetField(id, best.evidence.text) };
    }),
  );
  for (const { id, result } of classifications) {
    choices[id] = { answer: result.answer, confidence: result.confidence };
    inputTokens += result.inputTokens;
    responseModel = result.model;
  }
  inputTokens += qualification.inputTokens;
  responseModel = qualification.model;
  const sheet = buildSheetFields(
    candidates,
    choices,
    config.sheetEvidenceThreshold,
    config.sheetAnswerThreshold,
  );
  return {
    fields: sheet.fields,
    diagnostics: [...sheet.diagnostics, ...qualification.diagnostics],
    qualificationChecklist: qualification.qualificationChecklist,
    model: responseModel,
    inputTokens,
  };
}

async function processSheet(
  sheetId: string,
  tenderId: string,
  indexVersion: number,
  unreadDocuments: number,
  quotaDay: string,
): Promise<void> {
  try {
    const calculated = await calculateTenderSheet(tenderId, indexVersion);
    const summaryConfig = openAiConfig();
    const summaryRequestedModel = summaryConfig.apiKey
      ? summaryConfig.model
      : "disabled";
    const summaryAttempt = await safelyGenerateSheetSummary(
      calculated.fields,
      calculated.qualificationChecklist,
    );
    const estimatedCost = calculated.inputTokens * 0.000000042;
    const generatedAt = new Date();
    await db
      .update(tenderAiSheetsTable)
      .set({
        status: "ready",
        fields: calculated.fields,
        qualificationChecklist: calculated.qualificationChecklist,
        summary: summaryAttempt.summary,
        summaryPromptVersion: SHEET_SUMMARY_PROMPT_VERSION,
        summaryRequestedModel,
        summaryResponseModel: summaryAttempt.model,
        summaryGeneratedAt: summaryAttempt.model ? generatedAt : null,
        summaryInputTokens: summaryAttempt.inputTokens,
        summaryOutputTokens: summaryAttempt.outputTokens,
        summaryEstimatedCostUsd: summaryAttempt.costUsd.toFixed(8),
        diagnostics: calculated.diagnostics,
        unreadDocuments,
        responseModel: calculated.model,
        inputTokens: calculated.inputTokens,
        estimatedCostUsd: estimatedCost.toFixed(8),
        generatedAt,
        updatedAt: generatedAt,
      })
      .where(eq(tenderAiSheetsTable.id, sheetId));
    await db
      .update(aiSheetDailyUsageTable)
      .set({
        inputTokens: sql`${aiSheetDailyUsageTable.inputTokens} + ${calculated.inputTokens}`,
        estimatedCostUsd: sql`${aiSheetDailyUsageTable.estimatedCostUsd} + ${estimatedCost.toFixed(8)}`,
        updatedAt: generatedAt,
      })
      .where(eq(aiSheetDailyUsageTable.quotaDay, quotaDay));
  } catch (error) {
    await db
      .update(tenderAiSheetsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(tenderAiSheetsTable.id, sheetId));
    logger.error(
      { err: error, tenderId, indexVersion },
      "Tender sheet generation failed",
    );
    throw error;
  }
}

export async function executeTenderSheetJob(sheetId: string, tenderId: string): Promise<void> {
  const [sheet] = await db.select().from(tenderAiSheetsTable)
    .where(and(eq(tenderAiSheetsTable.id, sheetId), eq(tenderAiSheetsTable.tenderId, tenderId))).limit(1);
  if (!sheet || sheet.status === "ready") return;
  await processSheet(
    sheet.id,
    tenderId,
    sheet.indexVersion,
    sheet.unreadDocuments,
    dateInSaoPaulo(sheet.createdAt),
  );
}

export async function executeTenderSheetSummaryJob(
  sheetId: string,
  tenderId: string,
  requestedModel: string,
  promptVersion: number,
): Promise<void> {
  const [sheet] = await db.select().from(tenderAiSheetsTable)
    .where(and(
      eq(tenderAiSheetsTable.id, sheetId),
      eq(tenderAiSheetsTable.tenderId, tenderId),
      eq(tenderAiSheetsTable.status, "ready"),
    ))
    .limit(1);
  if (!sheet || promptVersion !== SHEET_SUMMARY_PROMPT_VERSION) return;

  const config = openAiConfig();
  if (config.apiKey && config.model !== requestedModel) return;
  const attempt = config.apiKey
    ? await safelyGenerateSheetSummary(sheet.fields, sheet.qualificationChecklist)
    : EMPTY_SUMMARY_ATTEMPT;
  const completedAt = new Date();
  await db
    .update(tenderAiSheetsTable)
    .set({
      summary: attempt.summary,
      summaryPromptVersion: promptVersion,
      summaryRequestedModel: requestedModel,
      ...(attempt.model ? {
        summaryResponseModel: attempt.model,
        summaryGeneratedAt: completedAt,
        summaryInputTokens: attempt.inputTokens,
        summaryOutputTokens: attempt.outputTokens,
        summaryEstimatedCostUsd: attempt.costUsd.toFixed(8),
      } : {}),
      updatedAt: completedAt,
    })
    .where(and(
      eq(tenderAiSheetsTable.id, sheetId),
      eq(tenderAiSheetsTable.status, "ready"),
    ));
}

export async function getTenderSheet(
  tenderId: string,
  userId?: string,
  now = new Date(),
): Promise<TenderSheetResponse> {
  const summaryConfig = openAiConfig();
  const indexStatus = await ensureTenderIndex(tenderId, true, { userId, lane: "interactive" });
  const unreadDocuments = await unreadDocumentCount(tenderId);
  if (indexStatus === "expired") {
    const [cachedSheet] = await db.select().from(tenderAiSheetsTable)
      .where(and(eq(tenderAiSheetsTable.tenderId, tenderId), eq(tenderAiSheetsTable.status, "ready")))
      .limit(1);
    if (cachedSheet) {
      if (userId) await reserveTenderConsultation(userId, tenderId, now);
      return readySheetResponse(cachedSheet, summaryConfig);
    }
  }
  if (indexStatus !== "ready")
    return EMPTY_RESPONSE(indexStatus, unreadDocuments);

  const config = aiConfig();
  const [index] = await db
    .select({ version: tenderAiIndexesTable.version })
    .from(tenderAiIndexesTable)
    .where(eq(tenderAiIndexesTable.tenderId, tenderId))
    .limit(1);
  if (!index) return EMPTY_RESPONSE("not_started", unreadDocuments);
  // The process has readable documents: opening its sheet counts (once a day) against the user's quota.
  if (userId) await reserveTenderConsultation(userId, tenderId, now);
  const cacheKey = sheetCacheKey(tenderId, index.version, config.model);
  const cacheWhere = and(
    eq(tenderAiSheetsTable.tenderId, tenderId),
    eq(tenderAiSheetsTable.indexVersion, index.version),
    eq(tenderAiSheetsTable.requestedModel, config.model),
    eq(tenderAiSheetsTable.promptVersion, SHEET_PROMPT_VERSION),
  );
  const [cached] = await db
    .select()
    .from(tenderAiSheetsTable)
    .where(cacheWhere)
    .limit(1);
  if (cached?.status === "ready") {
    return readySheetResponse(cached, summaryConfig);
  }
  const staleProcessing =
    cached?.status === "processing" &&
    cached.updatedAt.getTime() < now.getTime() - 15 * 60_000;
  if (
    cached?.status === "processing" && !staleProcessing
  ) {
    return EMPTY_RESPONSE("processing", unreadDocuments);
  }
  if (!config.apiKey)
    throw new AiUnavailableError(
      "The tender-sheet service is temporarily unavailable",
    );

  const sheetId =
    cached?.id ?? createHash("sha256").update(cacheKey).digest("hex");
  let ownsGeneration = Boolean(cached);
  if (!cached) {
    const inserted = await db
      .insert(tenderAiSheetsTable)
      .values({
        id: sheetId,
        tenderId,
        indexVersion: index.version,
        requestedModel: config.model,
        promptVersion: SHEET_PROMPT_VERSION,
        status: "processing",
        unreadDocuments,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: tenderAiSheetsTable.id });
    ownsGeneration = inserted.length === 1;
  }
  if (!ownsGeneration) return EMPTY_RESPONSE("processing", unreadDocuments);

  try {
    await reserveDailySheet(now);
  } catch (error) {
    if (!cached)
      await db
        .delete(tenderAiSheetsTable)
        .where(eq(tenderAiSheetsTable.id, sheetId));
    throw error;
  }
  if (cached) {
    await db
      .update(tenderAiSheetsTable)
      .set({
        status: "processing",
        fields: [],
        qualificationChecklist: [],
        summary: null,
        summaryPromptVersion: SHEET_SUMMARY_PROMPT_VERSION,
        summaryRequestedModel: "disabled",
        summaryResponseModel: null,
        summaryGeneratedAt: null,
        summaryInputTokens: 0,
        summaryOutputTokens: 0,
        summaryEstimatedCostUsd: "0",
        diagnostics: [],
        unreadDocuments,
        responseModel: null,
        inputTokens: 0,
        estimatedCostUsd: "0",
        generatedAt: null,
        updatedAt: now,
      })
      .where(eq(tenderAiSheetsTable.id, sheetId));
  }
  const quotaDay = dateInSaoPaulo(now);
  const dedupeKey = `sheet:${cacheKey}`;
  await enqueueAiJob({
    kind: "sheet",
    dedupeKey,
    tenderId,
    userId: null,
    payload: { sheetId },
    lane: "interactive",
  });
  if (appRoleFromEnv() === "all") void runEnqueuedAiJobNow(dedupeKey);
  return EMPTY_RESPONSE("processing", unreadDocuments);
}
