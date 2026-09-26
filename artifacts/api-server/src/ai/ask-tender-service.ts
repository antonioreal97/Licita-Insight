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
  type AiPassageRecord,
} from "@workspace/db";
import { entitlementSource, type EntitlementSource } from "../billing/billing-access";
import { AiQuotaExceededError, AiUnavailableError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { aiConfig } from "./config";
import { JevUnavailableError, scoreTenderPassage } from "./jev-client";
import { aiDailyLimit, aiQuotaResetsAt, lexicalSearchQuery, selectEvidencePassages, type PassageCandidate } from "./policy";
import { ensureTenderIndex, type IndexStatus } from "./tender-index-service";

export { ensureTenderIndex } from "./tender-index-service";

export type Quota = { used: number; limit: number; resetsAt: string };
export type AskStatus = {
  index: IndexStatus;
  documents: Array<{
    id: string;
    title: string;
    pages: number | null;
    status: string;
  }>;
  unreadDocuments: number;
  quota: Quota;
};

const normalizeQuestion = (value: string): string => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

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

async function quotaFor(userId: string, now: Date): Promise<Quota> {
  const day = dateInSaoPaulo(now);
  const [usage, source] = await Promise.all([
    db
      .select({ used: aiDailyUsageTable.used })
      .from(aiDailyUsageTable)
      .where(and(eq(aiDailyUsageTable.userId, userId), eq(aiDailyUsageTable.quotaDay, day)))
      .limit(1),
    accessSource(userId, now),
  ]);
  return {
    used: usage[0]?.used ?? 0,
    limit: aiDailyLimit(source),
    resetsAt: aiQuotaResetsAt(now),
  };
}

async function reserveQuota(userId: string, now: Date): Promise<Quota> {
  const day = dateInSaoPaulo(now);
  const source = await accessSource(userId, now);
  const limit = aiDailyLimit(source);
  const used = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai:${userId}:${day}`}))`);
    const [current] = await tx
      .select({ used: aiDailyUsageTable.used })
      .from(aiDailyUsageTable)
      .where(and(eq(aiDailyUsageTable.userId, userId), eq(aiDailyUsageTable.quotaDay, day)))
      .limit(1);
    if ((current?.used ?? 0) >= limit) throw new AiQuotaExceededError();
    const [updated] = await tx
      .insert(aiDailyUsageTable)
      .values({ userId, quotaDay: day, used: 1 })
      .onConflictDoUpdate({
        target: [aiDailyUsageTable.userId, aiDailyUsageTable.quotaDay],
        set: { used: sql`${aiDailyUsageTable.used} + 1`, updatedAt: now },
      })
      .returning({ used: aiDailyUsageTable.used });
    return updated!.used;
  });
  return { used, limit, resetsAt: aiQuotaResetsAt(now) };
}

export async function getAskStatus(userId: string, tenderId: string, trigger: boolean, now = new Date()): Promise<AskStatus> {
  const index = await ensureTenderIndex(tenderId, trigger);
  const documents = await db
    .select({
      id: tenderAiDocumentsTable.id,
      title: tenderAiDocumentsTable.title,
      pages: tenderAiDocumentsTable.pages,
      status: tenderAiDocumentsTable.status,
    })
    .from(tenderAiDocumentsTable)
    .where(eq(tenderAiDocumentsTable.tenderId, tenderId));
  const unreadDocuments = documents.filter(
    ({ status }) => status === "failed" || status === "unsupported",
  ).length;
  return {
    index,
    documents,
    unreadDocuments,
    quota: await quotaFor(userId, now),
  };
}

async function shortlist(tenderId: string, version: number, question: string): Promise<PassageCandidate[]> {
  const searchQuery = lexicalSearchQuery(question);
  if (!searchQuery) return [];
  const result = await db.execute<PassageCandidate>(sql`
    select p.document_id as "documentId", d.title as "documentTitle", d.source_url as "documentUrl", p.page, p.text
    from tender_ai_passages p
    join tender_ai_documents d on d.id = p.document_id,
         websearch_to_tsquery('portuguese', ${searchQuery}) query
    where p.tender_id = ${tenderId} and p.index_version = ${version} and p.search_vector @@ query
    order by ts_rank_cd(p.search_vector, query) desc, p.page asc
    limit ${aiConfig().shortlistSize}
  `);
  return result.rows;
}

export async function askTender(
  userId: string,
  tenderId: string,
  question: string,
  now = new Date(),
): Promise<{
  status: "answered" | "not_found" | "processing";
  passages: AiPassageRecord[];
  model: string;
  quota: Quota;
}> {
  const config = aiConfig();
  if (!config.apiKey) throw new AiUnavailableError();
  const indexStatus = await ensureTenderIndex(tenderId, true);
  if (indexStatus === "processing")
    return {
      status: "processing",
      passages: [],
      model: config.model,
      quota: await quotaFor(userId, now),
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
      model: config.model,
      quota: await quotaFor(userId, now),
    };
  const normalizedQuestion = normalizeQuestion(question);
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
      ),
    )
    .limit(1);
  if (cached && (cached.status === "answered" || cached.status === "not_found")) {
    return {
      status: cached.status,
      passages: cached.passages,
      model: cached.responseModel ?? config.model,
      quota: await quotaFor(userId, now),
    };
  }
  const candidates = await shortlist(tenderId, index.version, question);
  if (candidates.length === 0)
    return {
      status: "not_found",
      passages: [],
      model: config.model,
      quota: await quotaFor(userId, now),
    };
  const quota = await reserveQuota(userId, now);
  const requestId = cached?.id ?? randomUUID();
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
      ],
      set: { question, status: "processing", passages: [], updatedAt: now },
    });
  try {
    const scores = await Promise.all(candidates.map(({ text }) => scoreTenderPassage(question, text)));
    const passages = selectEvidencePassages(candidates, scores, config.threshold, config.relativeThresholdDelta);
    const inputTokens = scores.reduce((total, score) => total + score.inputTokens, 0);
    const estimatedCost = inputTokens * 0.000000042;
    const responseModel = scores[0]?.model ?? config.model;
    const status = passages.length > 0 ? "answered" : "not_found";
    await db
      .update(aiAskRequestsTable)
      .set({
        status,
        passages,
        responseModel,
        inputTokens,
        estimatedCostUsd: estimatedCost.toFixed(8),
        updatedAt: new Date(),
      })
      .where(eq(aiAskRequestsTable.id, requestId));
    await db
      .update(aiDailyUsageTable)
      .set({
        inputTokens: sql`${aiDailyUsageTable.inputTokens} + ${inputTokens}`,
        estimatedCostUsd: sql`${aiDailyUsageTable.estimatedCostUsd} + ${estimatedCost.toFixed(8)}`,
        updatedAt: new Date(),
      })
      .where(and(eq(aiDailyUsageTable.userId, userId), eq(aiDailyUsageTable.quotaDay, dateInSaoPaulo(now))));
    return { status, passages, model: responseModel, quota };
  } catch (error) {
    await db.update(aiAskRequestsTable).set({ status: "failed", updatedAt: new Date() }).where(eq(aiAskRequestsTable.id, requestId));
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

export function startAiRetentionScheduler(): void {
  const run = () => {
    void purgeExpiredAiQuestions()
      .then((deleted) => {
        if (deleted > 0) logger.info({ deleted }, "Expired AI questions purged");
      })
      .catch((error) => logger.error({ err: error }, "AI question retention cleanup failed"));
  };
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}
