import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  aiSheetDailyUsageTable,
  db,
  tenderAiDocumentsTable,
  tenderAiIndexesTable,
  tenderAiSheetsTable,
  type TenderSheetDiagnostic,
  type TenderSheetField,
  type TenderSheetFieldId,
} from "@workspace/db";
import { AiQuotaExceededError, AiUnavailableError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { ensureTenderIndex } from "./ask-tender-service";
import { aiConfig } from "./config";
import { classifySheetField, scoreSheetPassage } from "./jev-client";
import {
  buildSheetFields,
  SHEET_FIELDS,
  SHEET_PROMPT_VERSION,
  sheetCacheKey,
  sheetSearchQuery,
  type SheetChoice,
  type SheetScoredCandidate,
} from "./tender-sheet-policy";

type SheetStatus =
  | "not_started"
  | "processing"
  | "ready"
  | "failed"
  | "no_documents"
  | "unsupported";

export type TenderSheetResponse = {
  status: SheetStatus;
  fields: TenderSheetField[];
  unreadDocuments: number;
  model: string | null;
  generatedAt: string | null;
};

export type TenderSheetCalculation = {
  fields: TenderSheetField[];
  diagnostics: TenderSheetDiagnostic[];
  model: string;
  inputTokens: number;
};

type Candidate = {
  id: string;
  documentTitle: string;
  documentUrl: string;
  page: number;
  text: string;
};

const runningSheets = new Map<string, Promise<void>>();
const EMPTY_RESPONSE = (
  status: SheetStatus,
  unreadDocuments: number,
): TenderSheetResponse => ({
  status,
  fields: [],
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

export async function calculateTenderSheet(
  tenderId: string,
  indexVersion: number,
): Promise<TenderSheetCalculation> {
  const config = aiConfig();
  const shortlists = await Promise.all(
    SHEET_FIELDS.map(async ({ id }) => ({
      id,
      candidates: await shortlistField(tenderId, indexVersion, id),
    })),
  );
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
  return {
    ...buildSheetFields(
      candidates,
      choices,
      config.sheetEvidenceThreshold,
      config.sheetAnswerThreshold,
    ),
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
    const estimatedCost = calculated.inputTokens * 0.000000042;
    const generatedAt = new Date();
    await db
      .update(tenderAiSheetsTable)
      .set({
        status: "ready",
        fields: calculated.fields,
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
  }
}

export async function getTenderSheet(
  tenderId: string,
  now = new Date(),
): Promise<TenderSheetResponse> {
  const indexStatus = await ensureTenderIndex(tenderId, true);
  const unreadDocuments = await unreadDocumentCount(tenderId);
  if (indexStatus !== "ready")
    return EMPTY_RESPONSE(indexStatus, unreadDocuments);

  const config = aiConfig();
  const [index] = await db
    .select({ version: tenderAiIndexesTable.version })
    .from(tenderAiIndexesTable)
    .where(eq(tenderAiIndexesTable.tenderId, tenderId))
    .limit(1);
  if (!index) return EMPTY_RESPONSE("not_started", unreadDocuments);
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
    return {
      status: "ready",
      fields: cached.fields,
      unreadDocuments: cached.unreadDocuments,
      model: cached.responseModel ?? cached.requestedModel,
      generatedAt: cached.generatedAt?.toISOString() ?? null,
    };
  }
  const staleProcessing =
    cached?.status === "processing" &&
    cached.updatedAt.getTime() < now.getTime() - 15 * 60_000;
  if (
    (cached?.status === "processing" && !staleProcessing) ||
    runningSheets.has(cacheKey)
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
  const task = processSheet(
    sheetId,
    tenderId,
    index.version,
    unreadDocuments,
    quotaDay,
  ).finally(() => runningSheets.delete(cacheKey));
  runningSheets.set(cacheKey, task);
  return EMPTY_RESPONSE("processing", unreadDocuments);
}
