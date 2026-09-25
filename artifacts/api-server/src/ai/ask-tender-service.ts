import { createHash, randomUUID } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  aiAskRequestsTable,
  aiDailyUsageTable,
  db,
  subscriptionsTable,
  tenderAiDocumentsTable,
  tenderAiIndexesTable,
  tenderAiPassagesTable,
  tendersTable,
  usersTable,
  type AiPassageRecord,
  type TenderDocumentRecord,
} from "@workspace/db";
import { entitlementSource, type EntitlementSource } from "../billing/billing-access";
import { AiQuotaExceededError, AiUnavailableError, NotFoundError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { aiConfig } from "./config";
import { chunkPages, extractDocuments } from "./document-extractor";
import { JevUnavailableError, scoreTenderPassage } from "./jev-client";
import { aiDailyLimit, aiQuotaResetsAt, completedIndexStatus, lexicalSearchQuery, selectEvidencePassages, type PassageCandidate } from "./policy";

type IndexStatus = "not_started" | "processing" | "ready" | "failed" | "no_documents" | "unsupported";
type StoredIndexStatus = Exclude<IndexStatus, "not_started">;

export type Quota = { used: number; limit: number; resetsAt: string };
export type AskStatus = {
  index: IndexStatus;
  documents: Array<{
    id: string;
    title: string;
    pages: number | null;
    status: string;
  }>;
  quota: Quota;
};

const runningIndexes = new Map<string, Promise<void>>();
const EXTRACTOR_VERSION = 3;

const fingerprint = (documents: TenderDocumentRecord[]): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        extractorVersion: EXTRACTOR_VERSION,
        documents: documents.map(({ id, name, url, sizeBytes, publishedAt }) => ({
          id,
          name,
          url,
          sizeBytes,
          publishedAt,
        })),
      }),
    )
    .digest("hex");

const documentId = (tenderId: string, sourceId: string, suffix: string): string =>
  createHash("sha256").update(`${tenderId}:${sourceId}:${suffix}`).digest("hex");

const passageId = (document: string, version: number, page: number, order: number): string =>
  createHash("sha256").update(`${document}:${version}:${page}:${order}`).digest("hex");

const normalizeQuestion = (value: string): string => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

const storedError = (error: unknown): string =>
  (error instanceof Error ? error.message : "Extraction failed").replace(/[\u0000-\u001F\u007F-\u009F]/g, "").slice(0, 2_000);

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

async function download(url: string, maxBytes: number): Promise<Uint8Array> {
  const allowedHosts = aiConfig().documentHosts;
  const validateUrl = (value: string): URL => {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || !allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      throw new Error("DOCUMENT_URL_NOT_ALLOWED");
    }
    return parsed;
  };
  validateUrl(url);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(aiConfig().documentTimeoutMs),
  });
  if (!response.ok) throw new Error(`DOCUMENT_HTTP_${response.status}`);
  validateUrl(response.url);
  const announced = Number(response.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > maxBytes) throw new Error("DOCUMENT_SIZE_LIMIT");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("DOCUMENT_SIZE_LIMIT");
  return bytes;
}

async function processIndex(tenderId: string, documents: TenderDocumentRecord[], version: number): Promise<void> {
  const config = aiConfig();
  let readyDocuments = 0;
  let unsupportedDocuments = 0;
  let failedDocuments = 0;
  try {
    await db.delete(tenderAiDocumentsTable).where(eq(tenderAiDocumentsTable.tenderId, tenderId));
    for (const sourceDocument of documents) {
      try {
        const bytes = await download(sourceDocument.url, config.maxDocumentBytes);
        const extracted = await extractDocuments(bytes, sourceDocument.name, config.maxPdfPages, config.maxDocumentBytes);
        if (extracted.length === 0) {
          unsupportedDocuments += 1;
          await db.insert(tenderAiDocumentsTable).values({
            id: documentId(tenderId, sourceDocument.id, "unsupported"),
            tenderId,
            sourceDocumentId: sourceDocument.id,
            title: sourceDocument.name,
            sourceUrl: sourceDocument.url,
            internalPath: null,
            pages: null,
            status: "unsupported",
            extractedAt: new Date(),
          });
          continue;
        }
        for (const file of extracted) {
          const id = documentId(tenderId, sourceDocument.id, file.idSuffix);
          const chunks = chunkPages(file.pages);
          const hasText = chunks.some(({ text }) => text.length >= 20);
          await db.insert(tenderAiDocumentsTable).values({
            id,
            tenderId,
            sourceDocumentId: sourceDocument.id,
            title: file.title,
            sourceUrl: sourceDocument.url,
            internalPath: file.internalPath,
            pages: file.pages.length,
            status: hasText ? "ready" : "unsupported",
            extractedAt: new Date(),
          });
          if (!hasText) {
            unsupportedDocuments += 1;
            continue;
          }
          readyDocuments += 1;
          if (chunks.length > 0) {
            await db.insert(tenderAiPassagesTable).values(
              chunks.map((chunk) => ({
                id: passageId(id, version, chunk.page, chunk.order),
                tenderId,
                documentId: id,
                indexVersion: version,
                page: chunk.page,
                passageOrder: chunk.order,
                text: chunk.text,
              })),
            );
          }
        }
      } catch (error) {
        failedDocuments += 1;
        logger.warn({ err: error, tenderId, sourceDocumentId: sourceDocument.id }, "Tender document extraction failed");
        await db.insert(tenderAiDocumentsTable).values({
          id: documentId(tenderId, sourceDocument.id, "failed"),
          tenderId,
          sourceDocumentId: sourceDocument.id,
          title: sourceDocument.name,
          sourceUrl: sourceDocument.url,
          internalPath: null,
          pages: null,
          status: "failed",
          error: storedError(error),
        });
      }
    }
    const status: StoredIndexStatus = completedIndexStatus(readyDocuments, unsupportedDocuments, failedDocuments);
    await db
      .update(tenderAiIndexesTable)
      .set({
        status,
        completedAt: new Date(),
        updatedAt: new Date(),
        error: null,
      })
      .where(eq(tenderAiIndexesTable.tenderId, tenderId));
  } catch (error) {
    await db
      .update(tenderAiIndexesTable)
      .set({
        status: "failed",
        error: storedError(error),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenderAiIndexesTable.tenderId, tenderId));
    logger.error({ err: error, tenderId }, "Tender AI indexing failed");
  }
}

export async function ensureTenderIndex(tenderId: string, trigger: boolean): Promise<IndexStatus> {
  const [tender] = await db.select({ documents: tendersTable.documents }).from(tendersTable).where(eq(tendersTable.id, tenderId)).limit(1);
  if (!tender) throw new NotFoundError("Tender was not found");
  const documents = tender.documents;
  const currentFingerprint = fingerprint(documents);
  const [existing] = await db.select().from(tenderAiIndexesTable).where(eq(tenderAiIndexesTable.tenderId, tenderId)).limit(1);
  if (existing && existing.sourceFingerprint === currentFingerprint) {
    const status = existing.status as StoredIndexStatus;
    const staleProcessing = status === "processing" && existing.updatedAt.getTime() < Date.now() - 15 * 60_000;
    const retryable = status === "failed" || staleProcessing;
    if (!retryable || !trigger || runningIndexes.has(tenderId)) return status;
    await db
      .update(tenderAiIndexesTable)
      .set({
        status: "processing",
        error: null,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenderAiIndexesTable.tenderId, tenderId));
    const task = processIndex(tenderId, documents, existing.version).finally(() => runningIndexes.delete(tenderId));
    runningIndexes.set(tenderId, task);
    return "processing";
  }
  if (!trigger) return (existing?.status as StoredIndexStatus) ?? "not_started";
  const now = new Date();
  const status: StoredIndexStatus = documents.length === 0 ? "no_documents" : "processing";
  const version = existing ? existing.version + 1 : 1;
  await db
    .insert(tenderAiIndexesTable)
    .values({
      tenderId,
      version,
      sourceFingerprint: currentFingerprint,
      status,
      startedAt: now,
      completedAt: documents.length === 0 ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: tenderAiIndexesTable.tenderId,
      set: {
        version,
        sourceFingerprint: currentFingerprint,
        status,
        error: null,
        startedAt: now,
        completedAt: documents.length === 0 ? now : null,
        updatedAt: now,
      },
    });
  if (documents.length > 0 && !runningIndexes.has(tenderId)) {
    const task = processIndex(tenderId, documents, version).finally(() => runningIndexes.delete(tenderId));
    runningIndexes.set(tenderId, task);
  }
  return status;
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
  return { index, documents, quota: await quotaFor(userId, now) };
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
