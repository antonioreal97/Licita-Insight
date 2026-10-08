import { createHash } from "node:crypto";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import {
  db,
  tenderAiDocumentsTable,
  tenderAiIndexesTable,
  tenderAiPassagesTable,
  tendersTable,
  savedTendersTable,
  type TenderDocumentRecord,
} from "@workspace/db";
import { NotFoundError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { aiConfig } from "./config";
import {
  classifyDocumentFailure,
  DocumentFetchError,
  documentRetrySchedule,
  type DocumentFailureKind,
} from "./document-retry-policy";
import {
  chunkPages,
  extractDocuments,
  type ExtractedDocument,
} from "./document-extractor";
import { completedIndexStatus } from "./policy";
import { enqueueAiJob, runEnqueuedAiJobNow } from "./ai-job-queue";
import { appRoleFromEnv } from "../app-role";
import { scheduleTenderDetailEnrichment } from "../ingest/schedule-tender-detail-enrichment";

export type IndexStatus =
  | "not_started"
  | "processing"
  | "ready"
  | "failed"
  | "no_documents"
  | "unsupported"
  | "expired";
type StoredIndexStatus = Exclude<IndexStatus, "not_started" | "expired">;

const EXTRACTOR_VERSION = 4;
const STALE_PROCESSING_MS = 15 * 60_000;
const RETRY_JOB_BATCH_SIZE = 10;
const RETRY_CLAIM_MS = 5 * 60_000;

const fingerprint = (documents: TenderDocumentRecord[]): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        extractorVersion: EXTRACTOR_VERSION,
        documents: documents.map(
          ({ id, name, url, sizeBytes, publishedAt }) => ({
            id,
            name,
            url,
            sizeBytes,
            publishedAt,
          }),
        ),
      }),
    )
    .digest("hex");

const documentId = (
  tenderId: string,
  sourceId: string,
  suffix: string,
): string =>
  createHash("sha256")
    .update(`${tenderId}:${sourceId}:${suffix}`)
    .digest("hex");

const passageId = (
  document: string,
  version: number,
  page: number,
  order: number,
): string =>
  createHash("sha256")
    .update(`${document}:${version}:${page}:${order}`)
    .digest("hex");

const storedError = (error: unknown): string =>
  (error instanceof Error ? error.message : "Extraction failed")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .slice(0, 2_000);

const sourceRows = async (tenderId: string, sourceDocumentId: string) =>
  db
    .select()
    .from(tenderAiDocumentsTable)
    .where(
      and(
        eq(tenderAiDocumentsTable.tenderId, tenderId),
        eq(tenderAiDocumentsTable.sourceDocumentId, sourceDocumentId),
      ),
    );

const validateDocumentUrl = (value: string): URL => {
  const allowedHosts = aiConfig().documentHosts;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DocumentFetchError("DOCUMENT_URL_INVALID", "permanent");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    !allowedHosts.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    )
  ) {
    throw new DocumentFetchError("DOCUMENT_URL_NOT_ALLOWED", "permanent");
  }
  return parsed;
};

const downloadDocument = async (
  url: string,
  maxBytes: number,
): Promise<Uint8Array> => {
  validateDocumentUrl(url);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(aiConfig().documentTimeoutMs),
    });
  } catch (error) {
    if (classifyDocumentFailure(error) === "transient") throw error;
    throw new DocumentFetchError(storedError(error), "transient");
  }
  if (!response.ok) {
    const kind: DocumentFailureKind =
      response.status === 429 || response.status >= 500
        ? "transient"
        : "permanent";
    throw new DocumentFetchError(`DOCUMENT_HTTP_${response.status}`, kind);
  }
  validateDocumentUrl(response.url);
  const announced = Number(response.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > maxBytes) {
    throw new DocumentFetchError("DOCUMENT_SIZE_LIMIT", "permanent");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new DocumentFetchError("DOCUMENT_SIZE_LIMIT", "permanent");
  }
  return bytes;
};

const extractSource = async (
  sourceDocument: TenderDocumentRecord,
): Promise<ExtractedDocument[]> => {
  const config = aiConfig();
  const bytes = await downloadDocument(
    sourceDocument.url,
    config.maxDocumentBytes,
  );
  return extractDocuments(
    bytes,
    sourceDocument.name,
    config.maxPdfPages,
    config.maxArchiveUncompressedBytes,
  );
};

type DocumentInsert = typeof tenderAiDocumentsTable.$inferInsert;
type PassageInsert = typeof tenderAiPassagesTable.$inferInsert;

const prepareExtraction = (
  tenderId: string,
  sourceDocument: TenderDocumentRecord,
  extracted: ExtractedDocument[],
  version: number,
  attemptedAt: Date,
): {
  documents: DocumentInsert[];
  passages: PassageInsert[];
  readable: number;
} => {
  if (extracted.length === 0) {
    return {
      documents: [
        {
          id: documentId(tenderId, sourceDocument.id, "unsupported"),
          tenderId,
          sourceDocumentId: sourceDocument.id,
          title: sourceDocument.name,
          sourceUrl: sourceDocument.url,
          internalPath: null,
          pages: null,
          status: "unsupported",
          error: "DOCUMENT_UNSUPPORTED_OR_INVALID",
          attemptCount: 1,
          retryable: false,
          nextRetryAt: null,
          lastAttemptAt: attemptedAt,
          extractedAt: attemptedAt,
        },
      ],
      passages: [],
      readable: 0,
    };
  }

  const documents: DocumentInsert[] = [];
  const passages: PassageInsert[] = [];
  let readable = 0;
  for (const file of extracted) {
    const id = documentId(tenderId, sourceDocument.id, file.idSuffix);
    const chunks = chunkPages(file.pages);
    const hasText = !file.unreadReason && chunks.some(({ text }) => text.length >= 20);
    documents.push({
      id,
      tenderId,
      sourceDocumentId: sourceDocument.id,
      title: file.title,
      sourceUrl: sourceDocument.url,
      internalPath: file.internalPath,
      pages: file.pages.length,
      status: hasText ? "ready" : "unsupported",
      error: hasText ? null : file.unreadReason ?? "unsupported_format:empty_document",
      attemptCount: 1,
      retryable: false,
      nextRetryAt: null,
      lastAttemptAt: attemptedAt,
      extractedAt: attemptedAt,
    });
    if (!hasText) continue;
    readable += 1;
    passages.push(
      ...chunks.map((chunk) => ({
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
  return { documents, passages, readable };
};

const insertExtraction = async (
  tenderId: string,
  sourceDocument: TenderDocumentRecord,
  extracted: ExtractedDocument[],
  version: number,
  attemptedAt: Date,
): Promise<number> => {
  const previous = await sourceRows(tenderId, sourceDocument.id);
  const prepared = prepareExtraction(
    tenderId,
    sourceDocument,
    extracted,
    version,
    attemptedAt,
  );
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`ai-index:${tenderId}`}))`,
    );
    if (previous.length > 0) {
      await tx.delete(tenderAiDocumentsTable).where(
        inArray(
          tenderAiDocumentsTable.id,
          previous.map(({ id }) => id),
        ),
      );
    }
    await tx.insert(tenderAiDocumentsTable).values(prepared.documents);
    if (prepared.passages.length > 0) {
      await tx.insert(tenderAiPassagesTable).values(prepared.passages);
    }
  });
  return prepared.readable;
};

const copyPassages = async (
  tenderId: string,
  documentIds: string[],
  fromVersion: number,
  toVersion: number,
): Promise<void> => {
  if (fromVersion === toVersion || documentIds.length === 0) return;
  const passages = await db
    .select()
    .from(tenderAiPassagesTable)
    .where(
      and(
        eq(tenderAiPassagesTable.tenderId, tenderId),
        eq(tenderAiPassagesTable.indexVersion, fromVersion),
        inArray(tenderAiPassagesTable.documentId, documentIds),
      ),
    );
  if (passages.length === 0) return;
  await db
    .insert(tenderAiPassagesTable)
    .values(
      passages.map((passage) => ({
        id: passageId(
          passage.documentId,
          toVersion,
          passage.page,
          passage.passageOrder,
        ),
        tenderId,
        documentId: passage.documentId,
        indexVersion: toVersion,
        page: passage.page,
        passageOrder: passage.passageOrder,
        text: passage.text,
      })),
    )
    .onConflictDoNothing();
};

const recordFailure = async (
  tenderId: string,
  sourceDocument: TenderDocumentRecord,
  error: unknown,
  attemptCount: number,
  attemptedAt: Date,
  fromVersion: number,
  toVersion: number,
): Promise<void> => {
  const rows = await sourceRows(tenderId, sourceDocument.id);
  const readableRows = rows.filter(({ status }) => status === "ready");
  const failureKind = classifyDocumentFailure(error);
  const schedule = documentRetrySchedule(
    failureKind,
    attemptCount,
    aiConfig().documentRetryMaxAttempts,
    attemptedAt,
  );

  if (readableRows.length > 0) {
    await copyPassages(
      tenderId,
      readableRows.map(({ id }) => id),
      fromVersion,
      toVersion,
    );
    await db
      .update(tenderAiDocumentsTable)
      .set({
        error: null,
        attemptCount: 0,
        retryable: false,
        nextRetryAt: null,
        lastAttemptAt: attemptedAt,
      })
      .where(
        and(
          eq(tenderAiDocumentsTable.tenderId, tenderId),
          eq(tenderAiDocumentsTable.sourceDocumentId, sourceDocument.id),
        ),
      );
    await db
      .update(tenderAiDocumentsTable)
      .set({
        error: storedError(error),
        attemptCount,
        retryable: schedule.retryable,
        nextRetryAt: schedule.nextRetryAt,
        lastAttemptAt: attemptedAt,
      })
      .where(eq(tenderAiDocumentsTable.id, readableRows[0]!.id));
  } else {
    if (rows.length > 0) {
      await db.delete(tenderAiDocumentsTable).where(
        inArray(
          tenderAiDocumentsTable.id,
          rows.map(({ id }) => id),
        ),
      );
    }
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
      attemptCount,
      retryable: schedule.retryable,
      nextRetryAt: schedule.nextRetryAt,
      lastAttemptAt: attemptedAt,
    });
  }

  logger.warn(
    {
      tenderId,
      sourceDocumentId: sourceDocument.id,
      attempt: attemptCount,
      maxAttempts: aiConfig().documentRetryMaxAttempts,
      failureKind,
      retryable: schedule.retryable,
      nextRetryAt: schedule.nextRetryAt?.toISOString() ?? null,
      preservedExtraction: readableRows.length > 0,
      error: storedError(error),
    },
    "Tender document extraction attempt failed",
  );
};

const indexStatusFromDocuments = async (
  tenderId: string,
): Promise<StoredIndexStatus> => {
  const rows = await db
    .select({ status: tenderAiDocumentsTable.status })
    .from(tenderAiDocumentsTable)
    .where(eq(tenderAiDocumentsTable.tenderId, tenderId));
  return completedIndexStatus(
    rows.filter(({ status }) => status === "ready").length,
    rows.filter(({ status }) => status === "unsupported").length,
    rows.filter(({ status }) => status === "failed").length,
  );
};

const finishIndex = async (tenderId: string): Promise<StoredIndexStatus> => {
  const status = await indexStatusFromDocuments(tenderId);
  const now = new Date();
  await db
    .update(tenderAiIndexesTable)
    .set({ status, completedAt: now, updatedAt: now, error: null })
    .where(eq(tenderAiIndexesTable.tenderId, tenderId));
  return status;
};

const processIndex = async (
  tenderId: string,
  documents: TenderDocumentRecord[],
  version: number,
  previousVersion: number,
): Promise<void> => {
  try {
    const sourceIds = new Set(documents.map(({ id }) => id));
    const existingRows = await db
      .select({
        id: tenderAiDocumentsTable.id,
        sourceDocumentId: tenderAiDocumentsTable.sourceDocumentId,
      })
      .from(tenderAiDocumentsTable)
      .where(eq(tenderAiDocumentsTable.tenderId, tenderId));
    const removedIds = existingRows
      .filter(({ sourceDocumentId }) => !sourceIds.has(sourceDocumentId))
      .map(({ id }) => id);
    if (removedIds.length > 0) {
      await db
        .delete(tenderAiDocumentsTable)
        .where(inArray(tenderAiDocumentsTable.id, removedIds));
    }

    for (const sourceDocument of documents) {
      const attemptedAt = new Date();
      try {
        const extracted = await extractSource(sourceDocument);
        await insertExtraction(
          tenderId,
          sourceDocument,
          extracted,
          version,
          attemptedAt,
        );
        logger.info(
          {
            tenderId,
            sourceDocumentId: sourceDocument.id,
            attempt: 1,
            readableFiles: extracted.length,
          },
          "Tender document extraction attempt completed",
        );
      } catch (error) {
        await recordFailure(
          tenderId,
          sourceDocument,
          error,
          1,
          attemptedAt,
          previousVersion,
          version,
        );
      }
    }
    await finishIndex(tenderId);
  } catch (error) {
    const now = new Date();
    const status = await indexStatusFromDocuments(tenderId).catch(
      () => "failed" as const,
    );
    await db
      .update(tenderAiIndexesTable)
      .set({
        status,
        error: storedError(error),
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(tenderAiIndexesTable.tenderId, tenderId));
    logger.error({ err: error, tenderId }, "Tender AI indexing failed");
    throw error;
  }
};

export async function executeTenderIndexJob(
  tenderId: string,
  version: number,
  previousVersion: number,
): Promise<void> {
  const [tender, index] = await Promise.all([
    db.select({ documents: tendersTable.documents }).from(tendersTable)
      .where(eq(tendersTable.id, tenderId)).limit(1),
    db.select({ version: tenderAiIndexesTable.version }).from(tenderAiIndexesTable)
      .where(eq(tenderAiIndexesTable.tenderId, tenderId)).limit(1),
  ]);
  if (!tender[0] || index[0]?.version !== version) return;
  await processIndex(tenderId, tender[0].documents, version, previousVersion);
}

export async function ensureTenderIndex(
  tenderId: string,
  trigger: boolean,
  options: { userId?: string; lane?: "interactive" | "batch" } = {},
): Promise<IndexStatus> {
  const [tender] = await db
    .select({
      documents: tendersTable.documents,
      sourceId: tendersTable.sourceId,
      detailsFetchedAt: tendersTable.detailsFetchedAt,
    })
    .from(tendersTable)
    .where(eq(tendersTable.id, tenderId))
    .limit(1);
  if (!tender) throw new NotFoundError("Tender was not found");
  const documents = tender.documents;
  // A PNCP tender only gets its files once the detail enrichment runs (opening the detail page schedules it, in
  // parallel with this call). Until then an empty list means "not fetched yet", not "no documents": indexing it
  // would store no_documents for a tender that has files a moment later.
  if (documents.length === 0 && tender.sourceId === "pncp" && tender.detailsFetchedAt === null) {
    if (trigger) scheduleTenderDetailEnrichment(tenderId);
    return trigger ? "processing" : "not_started";
  }
  const currentFingerprint = fingerprint(documents);
  const [existing] = await db
    .select()
    .from(tenderAiIndexesTable)
    .where(eq(tenderAiIndexesTable.tenderId, tenderId))
    .limit(1);
  let forceReindex = false;
  if (existing?.purgedAt) {
    const saved = options.userId
      ? await db.select({ tenderId: savedTendersTable.tenderId }).from(savedTendersTable)
          .where(and(eq(savedTendersTable.userId, options.userId), eq(savedTendersTable.tenderId, tenderId))).limit(1)
      : [];
    if (saved.length === 0) return "expired";
    forceReindex = true;
    await db.update(tenderAiIndexesTable).set({ purgedAt: null, updatedAt: new Date() })
      .where(eq(tenderAiIndexesTable.tenderId, tenderId));
  }

  if (existing && existing.sourceFingerprint === currentFingerprint && !forceReindex) {
    const status = existing.status as StoredIndexStatus;
    return status;
  }

  if (!trigger) return (existing?.status as StoredIndexStatus) ?? "not_started";
  const now = new Date();
  const status: StoredIndexStatus =
    documents.length === 0 ? "no_documents" : "processing";
  const previousVersion = existing?.version ?? 0;
  const version = previousVersion + 1;
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

  if (documents.length === 0) {
    await db
      .delete(tenderAiDocumentsTable)
      .where(eq(tenderAiDocumentsTable.tenderId, tenderId));
  } else {
    const dedupeKey = `index:${tenderId}:${currentFingerprint}`;
    const queued = await enqueueAiJob({
      kind: "index",
      dedupeKey,
      tenderId,
      userId: options.userId,
      payload: { version, previousVersion },
      lane: options.lane ?? "interactive",
      enforceIndexUserRate: Boolean(options.userId),
    });
    if (queued.reason === "queue_full" || queued.reason === "user_rate_limited") {
      await db.delete(tenderAiIndexesTable).where(eq(tenderAiIndexesTable.tenderId, tenderId));
      return "not_started";
    }
    if (appRoleFromEnv() === "all") void runEnqueuedAiJobNow(dedupeKey);
  }
  return status;
}

const retryDocument = async (
  schedulerDocumentId: string,
  tenderId: string,
  sourceDocumentId: string,
  previousAttemptCount: number,
  now: Date,
): Promise<boolean> => {
  const [tender, index] = await Promise.all([
    db
      .select({ documents: tendersTable.documents })
      .from(tendersTable)
      .where(eq(tendersTable.id, tenderId))
      .limit(1),
    db
      .select()
      .from(tenderAiIndexesTable)
      .where(eq(tenderAiIndexesTable.tenderId, tenderId))
      .limit(1),
  ]);
  const sourceDocument = tender[0]?.documents.find(
    ({ id }) => id === sourceDocumentId,
  );
  if (!sourceDocument || !index[0]) {
    await db
      .update(tenderAiDocumentsTable)
      .set({ retryable: false, nextRetryAt: null, lastAttemptAt: now })
      .where(eq(tenderAiDocumentsTable.id, schedulerDocumentId));
    return false;
  }

  const currentIndex = index[0];
  const previousRows = await sourceRows(tenderId, sourceDocumentId);
  const attemptCount = previousAttemptCount + 1;
  try {
    const extracted = await extractSource(sourceDocument);
    const hasReadableText = extracted.some((file) =>
      chunkPages(file.pages).some(({ text }) => text.length >= 20),
    );
    if (!hasReadableText) {
      await insertExtraction(
        tenderId,
        sourceDocument,
        extracted,
        currentIndex.version,
        now,
      );
      await finishIndex(tenderId);
      logger.info(
        {
          tenderId,
          sourceDocumentId,
          attempt: attemptCount,
          outcome: "unsupported",
        },
        "Tender document retry completed",
      );
      return false;
    }

    const newVersion = currentIndex.version + 1;
    const prepared = prepareExtraction(
      tenderId,
      sourceDocument,
      extracted,
      newVersion,
      now,
    );
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`ai-index:${tenderId}`}))`,
      );
      const [lockedIndex] = await tx
        .select({ version: tenderAiIndexesTable.version })
        .from(tenderAiIndexesTable)
        .where(eq(tenderAiIndexesTable.tenderId, tenderId))
        .limit(1);
      if (lockedIndex?.version !== currentIndex.version) {
        throw new DocumentFetchError("INDEX_VERSION_CHANGED", "transient");
      }
      const allDocuments = await tx
        .select({
          id: tenderAiDocumentsTable.id,
          sourceDocumentId: tenderAiDocumentsTable.sourceDocumentId,
        })
        .from(tenderAiDocumentsTable)
        .where(eq(tenderAiDocumentsTable.tenderId, tenderId));
      const otherDocumentIds = allDocuments
        .filter((row) => row.sourceDocumentId !== sourceDocumentId)
        .map(({ id }) => id);
      const otherPassages =
        otherDocumentIds.length === 0
          ? []
          : await tx
              .select()
              .from(tenderAiPassagesTable)
              .where(
                and(
                  eq(tenderAiPassagesTable.tenderId, tenderId),
                  eq(tenderAiPassagesTable.indexVersion, currentIndex.version),
                  inArray(tenderAiPassagesTable.documentId, otherDocumentIds),
                ),
              );
      if (previousRows.length > 0) {
        await tx.delete(tenderAiDocumentsTable).where(
          inArray(
            tenderAiDocumentsTable.id,
            previousRows.map(({ id }) => id),
          ),
        );
      }
      await tx.insert(tenderAiDocumentsTable).values(prepared.documents);
      const copiedPassages: PassageInsert[] = otherPassages.map((passage) => ({
        id: passageId(
          passage.documentId,
          newVersion,
          passage.page,
          passage.passageOrder,
        ),
        tenderId,
        documentId: passage.documentId,
        indexVersion: newVersion,
        page: passage.page,
        passageOrder: passage.passageOrder,
        text: passage.text,
      }));
      const nextPassages = [...prepared.passages, ...copiedPassages];
      if (nextPassages.length > 0) {
        await tx.insert(tenderAiPassagesTable).values(nextPassages);
      }
      const statuses = await tx
        .select({ status: tenderAiDocumentsTable.status })
        .from(tenderAiDocumentsTable)
        .where(eq(tenderAiDocumentsTable.tenderId, tenderId));
      const status = completedIndexStatus(
        statuses.filter(({ status: value }) => value === "ready").length,
        statuses.filter(({ status: value }) => value === "unsupported").length,
        statuses.filter(({ status: value }) => value === "failed").length,
      );
      await tx
        .update(tenderAiIndexesTable)
        .set({
          version: newVersion,
          status,
          error: null,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(tenderAiIndexesTable.tenderId, tenderId));
    });
    logger.info(
      {
        tenderId,
        sourceDocumentId,
        attempt: attemptCount,
        outcome: "ready",
        previousVersion: currentIndex.version,
        version: newVersion,
      },
      "Tender document retry completed",
    );
    return true;
  } catch (error) {
    await recordFailure(
      tenderId,
      sourceDocument,
      error,
      attemptCount,
      now,
      currentIndex.version,
      currentIndex.version,
    );
    await finishIndex(tenderId);
    return false;
  } finally {
    if (previousRows.length === 0) {
      logger.warn(
        { tenderId, sourceDocumentId },
        "Tender document retry had no stored source row",
      );
    }
  }
};

export async function runDocumentRetryBatch(
  now = new Date(),
): Promise<{ attempted: number; recovered: number }> {
  const due = await db
    .select({
      id: tenderAiDocumentsTable.id,
      tenderId: tenderAiDocumentsTable.tenderId,
      sourceDocumentId: tenderAiDocumentsTable.sourceDocumentId,
      attemptCount: tenderAiDocumentsTable.attemptCount,
    })
    .from(tenderAiDocumentsTable)
    .where(
      and(
        eq(tenderAiDocumentsTable.retryable, true),
        lte(tenderAiDocumentsTable.nextRetryAt, now),
      ),
    )
    .orderBy(tenderAiDocumentsTable.nextRetryAt)
    .limit(RETRY_JOB_BATCH_SIZE);

  let attempted = 0;
  let recovered = 0;
  for (const candidate of due) {
    const [claimed] = await db
      .update(tenderAiDocumentsTable)
      .set({ nextRetryAt: new Date(now.getTime() + RETRY_CLAIM_MS) })
      .where(
        and(
          eq(tenderAiDocumentsTable.id, candidate.id),
          eq(tenderAiDocumentsTable.retryable, true),
          lte(tenderAiDocumentsTable.nextRetryAt, now),
        ),
      )
      .returning({ id: tenderAiDocumentsTable.id });
    if (!claimed) continue;
    attempted += 1;
    const task = retryDocument(
      candidate.id,
      candidate.tenderId,
      candidate.sourceDocumentId,
      candidate.attemptCount,
      now,
    );
    try {
      if (await task) recovered += 1;
    } finally { /* claim timestamp prevents duplicate retry cycles */ }
  }
  return { attempted, recovered };
}
