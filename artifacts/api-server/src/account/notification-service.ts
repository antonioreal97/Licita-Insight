import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  eq,
  gt,
  isNull,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import {
  db,
  notificationsTable,
  savedSearchesTable,
  savedTendersTable,
  tendersTable,
} from "@workspace/db";
import type { NotificationChangeRecord } from "@workspace/db/schema";
import { searchWhereFor } from "../repositories/postgres-tender-repository";
import { logger } from "../lib/logger";
import { canonicalSearchQuery } from "./saved-search-query";
import {
  tenderChanges,
  type TenderNotificationState,
} from "./notification-change";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 24);

export const createTenderChangeNotifications = async (
  tx: Transaction,
  input: {
    previous: TenderNotificationState;
    next: TenderNotificationState;
    sourceVersion: string;
    detectedAt: Date;
  },
): Promise<number> => {
  const changes = tenderChanges(input.previous, input.next);
  if (changes.length === 0) return 0;
  const subscribers = await tx
    .select({ userId: savedTendersTable.userId })
    .from(savedTendersTable)
    .where(
      and(
        eq(savedTendersTable.tenderId, input.next.id),
        eq(savedTendersTable.monitored, true),
      ),
    );
  if (subscribers.length === 0) return 0;

  const inserted = await tx
    .insert(notificationsTable)
    .values(
      subscribers.flatMap(({ userId }) =>
        changes.map(({ type, change }) => ({
          id: randomUUID(),
          userId,
          type,
          dedupeKey: `tender:${input.next.id}:${change.field}:${digest(input.sourceVersion)}:${digest(JSON.stringify(change))}`,
          createdAt: input.detectedAt,
          tenderId: input.next.id,
          tenderTitle: input.next.title,
          tenderNumberShort: input.next.tenderNumberShort,
          change,
        })),
      ),
    )
    .onConflictDoNothing()
    .returning({ id: notificationsTable.id });
  return inserted.length;
};

export const createDocumentAddedNotifications = async (
  tx: Transaction,
  input: {
    tender: Pick<TenderNotificationState, "id" | "title" | "tenderNumberShort">;
    previousCount: number;
    nextCount: number;
    addedDocumentIds: string[];
    detectedAt: Date;
  },
): Promise<number> => {
  if (input.addedDocumentIds.length === 0) return 0;
  const subscribers = await tx
    .select({ userId: savedTendersTable.userId })
    .from(savedTendersTable)
    .where(
      and(
        eq(savedTendersTable.tenderId, input.tender.id),
        eq(savedTendersTable.monitored, true),
      ),
    );
  if (subscribers.length === 0) return 0;
  const change: NotificationChangeRecord = {
    field: "documents",
    from: input.previousCount,
    to: input.nextCount,
  };
  const version = digest([...input.addedDocumentIds].sort().join("|"));
  const inserted = await tx
    .insert(notificationsTable)
    .values(
      subscribers.map(({ userId }) => ({
        id: randomUUID(),
        userId,
        type: "tender_document_added",
        dedupeKey: `tender:${input.tender.id}:documents:${version}`,
        createdAt: input.detectedAt,
        tenderId: input.tender.id,
        tenderTitle: input.tender.title,
        tenderNumberShort: input.tender.tenderNumberShort,
        change,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: notificationsTable.id });
  return inserted.length;
};

const evaluateSavedSearch = async (
  id: string,
  completedAt: Date,
): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`saved-search:${id}`}))`,
    );
    const [savedSearch] = await tx
      .select()
      .from(savedSearchesTable)
      .where(eq(savedSearchesTable.id, id))
      .limit(1);
    if (!savedSearch?.alertsEnabled || savedSearch.deletedAt) return;
    const since = savedSearch.lastCheckedAt ?? savedSearch.createdAt;
    if (since >= completedAt) return;
    const { criteria } = canonicalSearchQuery(savedSearch.query);
    const filter = and(
      searchWhereFor(criteria),
      gt(tendersTable.createdAt, since),
      lte(tendersTable.createdAt, completedAt),
    );
    const [totalRow] = await tx
      .select({ value: count() })
      .from(tendersTable)
      .where(filter);
    const matches = await tx
      .select({ id: tendersTable.id })
      .from(tendersTable)
      .where(filter)
      .orderBy(asc(tendersTable.createdAt), asc(tendersTable.id))
      .limit(20);
    const matchCount = Number(totalRow?.value ?? 0);
    let created = false;
    if (matchCount > 0) {
      const inserted = await tx
        .insert(notificationsTable)
        .values({
          id: randomUUID(),
          userId: savedSearch.userId,
          type: "saved_search_new_matches",
          dedupeKey: `saved-search:${id}:${since.toISOString()}:${completedAt.toISOString()}`,
          createdAt: completedAt,
          savedSearchId: id,
          savedSearchName: savedSearch.name,
          savedSearchQuery: savedSearch.query,
          matchCount,
          tenderIds: matches.map(({ id: tenderId }) => tenderId),
        })
        .onConflictDoNothing()
        .returning({ id: notificationsTable.id });
      created = inserted.length > 0;
    }
    await tx
      .update(savedSearchesTable)
      .set({
        lastCheckedAt: completedAt,
        ...(created
          ? { newMatchesCount: sql`${savedSearchesTable.newMatchesCount} + ${matchCount}` }
          : {}),
      })
      .where(eq(savedSearchesTable.id, id));
  });
};

export const evaluateSavedSearchNotifications = async (
  completedAt = new Date(),
): Promise<void> => {
  const searches = await db
    .select({ id: savedSearchesTable.id })
    .from(savedSearchesTable)
    .where(
      and(
        eq(savedSearchesTable.alertsEnabled, true),
        isNull(savedSearchesTable.deletedAt),
      ),
    );
  for (const { id } of searches) {
    try {
      await evaluateSavedSearch(id, completedAt);
    } catch (error) {
      logger.error({ err: error, savedSearchId: id }, "Saved search evaluation failed");
      throw error;
    }
  }
  await db
    .delete(notificationsTable)
    .where(
      lt(
        notificationsTable.createdAt,
        new Date(completedAt.getTime() - 90 * 24 * 60 * 60 * 1000),
      ),
    );
};
