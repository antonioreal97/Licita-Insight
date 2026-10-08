import { randomUUID } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  aiAskRequestsTable,
  aiDailyUsageTable,
  db,
  subscriptionsTable,
  tenderAiDocumentsTable,
  tenderAiIndexesTable,
  tenderAiPassagesTable,
  usersTable,
  type AiGeneratedSummary,
  type AiPassageRecord,
} from "@workspace/db";
import { entitlementSource, type EntitlementSource } from "../billing/billing-access";
import { AiQuotaExceededError, AiUnavailableError, ConflictError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { tryRunSingletonJob } from "../jobs/job-lock";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { aiConfig, openAiConfig } from "./config";
import { JevUnavailableError, scoreTenderPassage } from "./jev-client";
import {
  claimSharedAnswer,
  finishSharedAnswer,
  readSharedAnswer,
  readSharedEvidence,
  releaseSharedAnswer,
  seedSharedAnswer,
  sharedAnswerIdentity,
  waitForSharedAnswer,
  type SharedAnswer,
} from "./shared-answer-cache";
import {
  ASK_SUMMARY_PROMPT_VERSION,
  generateAskSummary,
  type SummaryAttempt,
} from "./openai-summary";
import { aiDailyLimit, askSearchQueries, mergeAskShortlists, selectEvidencePassages, type PassageCandidate } from "./policy";
import { ensureTenderIndex, type IndexStatus } from "./tender-index-service";
import { reserveTenderConsultation, tenderQuotaFor, type Quota } from "./tender-quota";
import { summarizeDocumentReading, type DocumentReadingSummary } from "./document-reading";

export { ensureTenderIndex } from "./tender-index-service";
export type { Quota } from "./tender-quota";
export type AskStatus = {
  index: IndexStatus;
  documents: Array<{
    id: string;
    title: string;
    pages: number | null;
    status: string;
  }>;
  unreadDocuments: number;
  documentReading: DocumentReadingSummary;
  quota: Quota;
};

const normalizeQuestion = (value: string): string => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

const EMPTY_SUMMARY_ATTEMPT: SummaryAttempt = {
  summary: null,
  model: null,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
};

async function safelyGenerateAskSummary(
  question: string,
  passages: AiPassageRecord[],
): Promise<SummaryAttempt> {
  try {
    return await generateAskSummary(question, passages);
  } catch (error) {
    logger.warn({ err: error }, "OpenAI ask summary was discarded");
    return EMPTY_SUMMARY_ATTEMPT;
  }
}

async function accessSource(userId: string, now: Date): Promise<EntitlementSource> {
  const [row] = await db
    .select({
      status: subscriptionsTable.status,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
      trialEndsAt: usersTable.trialEndsAt,
    })
    .from(usersTable)
    .leftJoin(subscriptionsTable, eq(subscriptionsTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);
  return entitlementSource(row ?? null, now);
}

export async function hasAiAccess(userId: string, now = new Date()): Promise<boolean> {
  return (await accessSource(userId, now)) !== null;
}

/** Safety cap on new questions (Jev + OpenAI calls); the user-facing quota counts processes (`tender-quota.ts`). */
async function reserveQuestion(userId: string, now: Date): Promise<void> {
  const day = dateInSaoPaulo(now);
  const source = await accessSource(userId, now);
  const limit = aiDailyLimit(source);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai:${userId}:${day}`}))`);
    const [current] = await tx
      .select({ used: aiDailyUsageTable.used })
      .from(aiDailyUsageTable)
      .where(and(eq(aiDailyUsageTable.userId, userId), eq(aiDailyUsageTable.quotaDay, day)))
      .limit(1);
    if ((current?.used ?? 0) >= limit) {
      throw new AiQuotaExceededError(undefined, [{ field: "quota", issue: "daily_questions" }]);
    }
    await tx
      .insert(aiDailyUsageTable)
      .values({ userId, quotaDay: day, used: 1 })
      .onConflictDoUpdate({
        target: [aiDailyUsageTable.userId, aiDailyUsageTable.quotaDay],
        set: { used: sql`${aiDailyUsageTable.used} + 1`, updatedAt: now },
      });
  });
}

export async function getAskStatus(userId: string, tenderId: string, trigger: boolean, now = new Date()): Promise<AskStatus> {
  const index = await ensureTenderIndex(tenderId, trigger, { userId, lane: "interactive" });
  const documents = await db
    .select({
      id: tenderAiDocumentsTable.id,
      title: tenderAiDocumentsTable.title,
      pages: tenderAiDocumentsTable.pages,
      status: tenderAiDocumentsTable.status,
      sourceUrl: tenderAiDocumentsTable.sourceUrl,
      error: tenderAiDocumentsTable.error,
    })
    .from(tenderAiDocumentsTable)
    .where(eq(tenderAiDocumentsTable.tenderId, tenderId));
  const unreadDocuments = documents.filter(
    ({ status }) => status === "failed" || status === "unsupported",
  ).length;
  return {
    index,
    documents: documents.map(({ id, title, pages, status }) => ({ id, title, pages, status })),
    unreadDocuments,
    documentReading: summarizeDocumentReading(documents),
    quota: await tenderQuotaFor(userId, tenderId, now),
  };
}

async function shortlist(tenderId: string, version: number, question: string): Promise<PassageCandidate[]> {
  const limit = aiConfig().shortlistSize;
  const groups = await Promise.all(askSearchQueries(question).map(async (searchQuery) => {
    const result = await db.execute<PassageCandidate>(sql`
      select p.document_id as "documentId", d.title as "documentTitle", d.source_url as "documentUrl", p.page, p.text
      from tender_ai_passages p
      join tender_ai_documents d on d.id = p.document_id,
           websearch_to_tsquery('portuguese', ${searchQuery}) query
      where p.tender_id = ${tenderId} and p.index_version = ${version} and p.search_vector @@ query
      order by ts_rank_cd(p.search_vector, query) desc, p.page asc, p.passage_order asc
      limit ${limit}
    `);
    return result.rows;
  }));
  return mergeAskShortlists(groups, limit);
}

export async function askTender(
  userId: string,
  tenderId: string,
  question: string,
  now = new Date(),
): Promise<{
  status: "answered" | "not_found" | "processing";
  passages: AiPassageRecord[];
  summary: AiGeneratedSummary | null;
  model: string;
  quota: Quota;
}> {
  const config = aiConfig();
  const summaryConfig = openAiConfig();
  const summaryRequestedModel = summaryConfig.apiKey ? summaryConfig.model : "disabled";
  const indexStatus = await ensureTenderIndex(tenderId, true, { userId, lane: "interactive" });
  if (indexStatus === "expired") {
    throw new ConflictError("The tender document index has expired", [
      { field: "index", issue: "index_expired" },
    ]);
  }
  if (!config.apiKey && indexStatus !== "ready") throw new AiUnavailableError();
  if (indexStatus === "processing")
    return {
      status: "processing",
      passages: [],
      summary: null,
      model: config.model,
      quota: await tenderQuotaFor(userId, tenderId, now),
    };
  const [index] = await db
    .select({ version: tenderAiIndexesTable.version })
    .from(tenderAiIndexesTable)
    .where(eq(tenderAiIndexesTable.tenderId, tenderId))
    .limit(1);
  if (!index || indexStatus !== "ready")
    return {
      status: "not_found",
      passages: [],
      summary: null,
      model: config.model,
      quota: await tenderQuotaFor(userId, tenderId, now),
    };
  // The process has readable documents: from here on it counts (once a day) against the user's quota.
  const tenderQuota = await reserveTenderConsultation(userId, tenderId, now);
  const normalizedQuestion = normalizeQuestion(question);
  const sharedIdentity = sharedAnswerIdentity({
    tenderId,
    indexVersion: index.version,
    normalizedQuestion,
    requestedModel: config.model,
    summaryRequestedModel,
    threshold: config.threshold,
    relativeThresholdDelta: config.relativeThresholdDelta,
    shortlistSize: config.shortlistSize,
  });
  const [cached] = await db
    .select()
    .from(aiAskRequestsTable)
    .where(
      and(
        eq(aiAskRequestsTable.userId, userId),
        eq(aiAskRequestsTable.tenderId, tenderId),
        eq(aiAskRequestsTable.normalizedQuestion, normalizedQuestion),
        eq(aiAskRequestsTable.indexVersion, index.version),
        eq(aiAskRequestsTable.requestedModel, config.model),
        eq(aiAskRequestsTable.summaryPromptVersion, ASK_SUMMARY_PROMPT_VERSION),
        eq(aiAskRequestsTable.summaryRequestedModel, summaryRequestedModel),
      ),
    )
    .limit(1);
  const fromShared = async (answer: SharedAnswer) => {
    await db.insert(aiAskRequestsTable).values({
      id: randomUUID(), userId, tenderId, question, normalizedQuestion,
      indexVersion: index.version, requestedModel: config.model,
      summaryPromptVersion: ASK_SUMMARY_PROMPT_VERSION, summaryRequestedModel,
      status: answer.status, passages: answer.passages, summary: answer.summary,
      responseModel: answer.model, cacheHit: true, updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [
        aiAskRequestsTable.userId, aiAskRequestsTable.tenderId,
        aiAskRequestsTable.normalizedQuestion, aiAskRequestsTable.indexVersion,
        aiAskRequestsTable.requestedModel, aiAskRequestsTable.summaryPromptVersion,
        aiAskRequestsTable.summaryRequestedModel,
      ],
      set: {
        question, status: answer.status, passages: answer.passages,
        summary: answer.summary, responseModel: answer.model, updatedAt: new Date(),
      },
    });
    return { ...answer, quota: tenderQuota };
  };
  const shared = await readSharedAnswer(sharedIdentity)
    ?? (config.threshold === 0.5 && config.relativeThresholdDelta === 0.25 && config.shortlistSize === 10
      ? await seedSharedAnswer(sharedIdentity, normalizedQuestion)
      : null);
  if (shared) return fromShared(shared);

  const claimToken = await claimSharedAnswer(sharedIdentity);
  if (!claimToken) {
    const completed = await waitForSharedAnswer(sharedIdentity);
    if (completed) return fromShared(completed);
    return { status: "processing", passages: [], summary: null, model: config.model,
      quota: tenderQuota };
  }
  let requestId: string | null = null;
  try {
    const previousEvidence = await readSharedEvidence(sharedIdentity);
    if (previousEvidence) {
      const summaryAttempt = previousEvidence.status === "answered"
        ? await safelyGenerateAskSummary(question, previousEvidence.passages)
        : EMPTY_SUMMARY_ATTEMPT;
      const answer: SharedAnswer = { ...previousEvidence, summary: summaryAttempt.summary };
      await db.insert(aiAskRequestsTable).values({
        id: randomUUID(), userId, tenderId, question, normalizedQuestion,
        indexVersion: index.version, requestedModel: config.model,
        summaryPromptVersion: ASK_SUMMARY_PROMPT_VERSION, summaryRequestedModel,
        status: answer.status, passages: answer.passages, summary: answer.summary,
        responseModel: answer.model, cacheHit: true,
        summaryResponseModel: summaryAttempt.model,
        summaryInputTokens: summaryAttempt.inputTokens,
        summaryOutputTokens: summaryAttempt.outputTokens,
        summaryEstimatedCostUsd: summaryAttempt.costUsd.toFixed(8),
      }).onConflictDoNothing();
      if (summaryAttempt.inputTokens + summaryAttempt.outputTokens > 0 || summaryAttempt.costUsd > 0) {
        const day = dateInSaoPaulo(now);
        await db.insert(aiDailyUsageTable).values({
          userId, quotaDay: day, used: 0,
          inputTokens: summaryAttempt.inputTokens + summaryAttempt.outputTokens,
          estimatedCostUsd: summaryAttempt.costUsd.toFixed(8),
        }).onConflictDoUpdate({
          target: [aiDailyUsageTable.userId, aiDailyUsageTable.quotaDay],
          set: {
            inputTokens: sql`${aiDailyUsageTable.inputTokens} + ${summaryAttempt.inputTokens + summaryAttempt.outputTokens}`,
            estimatedCostUsd: sql`${aiDailyUsageTable.estimatedCostUsd} + ${summaryAttempt.costUsd.toFixed(8)}`,
            updatedAt: new Date(),
          },
        });
      }
      await finishSharedAnswer(sharedIdentity, claimToken, answer);
      return { ...answer, quota: tenderQuota };
    }
    if (!config.apiKey) throw new AiUnavailableError();
    const candidates = await shortlist(tenderId, index.version, question);
    if (candidates.length === 0) {
      const answer: SharedAnswer = { status: "not_found", passages: [], summary: null, model: config.model };
      await finishSharedAnswer(sharedIdentity, claimToken, answer);
      return fromShared(answer);
    }
    await reserveQuestion(userId, now);
    requestId = cached?.id ?? randomUUID();
    await db
    .insert(aiAskRequestsTable)
    .values({
      id: requestId,
      userId,
      tenderId,
      question,
      normalizedQuestion,
      indexVersion: index.version,
      requestedModel: config.model,
      summaryPromptVersion: ASK_SUMMARY_PROMPT_VERSION,
      summaryRequestedModel,
      status: "processing",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        aiAskRequestsTable.userId,
        aiAskRequestsTable.tenderId,
        aiAskRequestsTable.normalizedQuestion,
        aiAskRequestsTable.indexVersion,
        aiAskRequestsTable.requestedModel,
        aiAskRequestsTable.summaryPromptVersion,
        aiAskRequestsTable.summaryRequestedModel,
      ],
      set: {
        question,
        status: "processing",
        passages: [],
        summary: null,
        summaryResponseModel: null,
        summaryInputTokens: 0,
        summaryOutputTokens: 0,
        summaryEstimatedCostUsd: "0",
        updatedAt: now,
      },
    });
    const scores = await Promise.all(candidates.map(({ text }) => scoreTenderPassage(question, text)));
    const passages = selectEvidencePassages(candidates, scores, config.threshold, config.relativeThresholdDelta);
    const inputTokens = scores.reduce((total, score) => total + score.inputTokens, 0);
    const estimatedCost = inputTokens * 0.000000042;
    const responseModel = scores[0]?.model ?? config.model;
    const status = passages.length > 0 ? "answered" : "not_found";
    const summaryAttempt = status === "answered"
      ? await safelyGenerateAskSummary(question, passages)
      : EMPTY_SUMMARY_ATTEMPT;
    await db
      .update(aiAskRequestsTable)
      .set({
        status,
        passages,
        summary: summaryAttempt.summary,
        summaryResponseModel: summaryAttempt.model,
        summaryInputTokens: summaryAttempt.inputTokens,
        summaryOutputTokens: summaryAttempt.outputTokens,
        summaryEstimatedCostUsd: summaryAttempt.costUsd.toFixed(8),
        responseModel,
        inputTokens,
        estimatedCostUsd: estimatedCost.toFixed(8),
        updatedAt: new Date(),
      })
      .where(eq(aiAskRequestsTable.id, requestId));
    await db
      .update(aiDailyUsageTable)
      .set({
        inputTokens: sql`${aiDailyUsageTable.inputTokens} + ${inputTokens + summaryAttempt.inputTokens + summaryAttempt.outputTokens}`,
        estimatedCostUsd: sql`${aiDailyUsageTable.estimatedCostUsd} + ${(estimatedCost + summaryAttempt.costUsd).toFixed(8)}`,
        updatedAt: new Date(),
      })
      .where(and(eq(aiDailyUsageTable.userId, userId), eq(aiDailyUsageTable.quotaDay, dateInSaoPaulo(now))));
    await finishSharedAnswer(sharedIdentity, claimToken, { status, passages,
      summary: summaryAttempt.summary, model: responseModel });
    return {
      status,
      passages,
      summary: summaryAttempt.summary,
      model: responseModel,
      quota: tenderQuota,
    };
  } catch (error) {
    await releaseSharedAnswer(sharedIdentity, claimToken);
    if (requestId) await db.update(aiAskRequestsTable).set({ status: "failed", updatedAt: new Date() }).where(eq(aiAskRequestsTable.id, requestId));
    if (error instanceof JevUnavailableError) throw new AiUnavailableError();
    throw error;
  }
}

export async function purgeExpiredAiQuestions(now = new Date()): Promise<number> {
  const deleted = await db
    .delete(aiAskRequestsTable)
    .where(lt(aiAskRequestsTable.createdAt, new Date(now.getTime() - 90 * 86_400_000)))
    .returning({ id: aiAskRequestsTable.id });
  return deleted.length;
}

export function startAiRetentionScheduler(): () => void {
  const run = () => {
    void tryRunSingletonJob("ai_question_retention", () => purgeExpiredAiQuestions())
      .then((result) => {
        if (result.acquired && result.value > 0) {
          logger.info({ deleted: result.value }, "Expired AI questions purged");
        }
      })
      .catch((error) => logger.error({ err: error }, "AI question retention cleanup failed"));
  };
  run();
  const timer = setInterval(run, 24 * 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
