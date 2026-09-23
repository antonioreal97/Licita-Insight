import { randomUUID } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import type {
  Notification,
  NotificationPage,
  SavedSearch,
  SavedTender,
  SavedTenderPage,
} from "@workspace/api-zod";
import {
  db,
  notificationsTable,
  savedSearchesTable,
  savedTendersTable,
  tendersTable,
} from "@workspace/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../lib/api-error";
import { tenderRowToDetail } from "../repositories/postgres-tender-repository";
import { toSummary } from "../services/search-service";
import type { SearchCriteria } from "../domain/search";
import { canonicalSearchQuery } from "./saved-search-query";

const MAX_SAVED_TENDERS = 500;
const MAX_SAVED_SEARCHES = 50;

const summaryCriteria: SearchCriteria = {
  query: null,
  mode: "keyword",
  status: [],
  modality: [],
  state: [],
  city: [],
  organizationId: [],
  sourceId: [],
  category: [],
  sort: "relevance",
  page: 1,
  pageSize: 20,
  facets: false,
};

const pagination = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  totalIsEstimate: false,
});

const toSavedTender = (
  saved: typeof savedTendersTable.$inferSelect,
  tender: typeof tendersTable.$inferSelect,
): SavedTender => ({
  tender: toSummary(tenderRowToDetail(tender), summaryCriteria, []),
  savedAt: saved.savedAt,
  monitored: saved.monitored,
  monitoredAt: saved.monitoredAt,
});

const toSavedSearch = (
  row: typeof savedSearchesTable.$inferSelect,
): SavedSearch => ({
  id: row.id,
  name: row.name,
  query: row.query,
  alertsEnabled: row.alertsEnabled,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  lastCheckedAt: row.lastCheckedAt,
  newMatchesCount: row.newMatchesCount,
});

const lockUser = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
};

export const listSavedTenders = async (input: {
  userId: string;
  page: number;
  pageSize: number;
  monitored?: boolean;
}): Promise<SavedTenderPage> => {
  const filter = and(
    eq(savedTendersTable.userId, input.userId),
    input.monitored === undefined
      ? undefined
      : eq(savedTendersTable.monitored, input.monitored),
  );
  const [[totalRow], rows] = await Promise.all([
    db.select({ value: count() }).from(savedTendersTable).where(filter),
    db
      .select({ saved: savedTendersTable, tender: tendersTable })
      .from(savedTendersTable)
      .innerJoin(tendersTable, eq(savedTendersTable.tenderId, tendersTable.id))
      .where(filter)
      .orderBy(desc(savedTendersTable.savedAt))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
  ]);
  const total = Number(totalRow?.value ?? 0);
  return {
    data: rows.map(({ saved, tender }) => toSavedTender(saved, tender)),
    pagination: pagination(input.page, input.pageSize, total),
  };
};

export const savedTenderIds = async (userId: string) => {
  const rows = await db
    .select({ tenderId: savedTendersTable.tenderId, monitored: savedTendersTable.monitored })
    .from(savedTendersTable)
    .where(eq(savedTendersTable.userId, userId));
  return {
    saved: rows.map(({ tenderId }) => tenderId),
    monitored: rows.filter(({ monitored }) => monitored).map(({ tenderId }) => tenderId),
  };
};

export const putSavedTender = async (input: {
  userId: string;
  tenderId: string;
  monitored?: boolean;
}): Promise<SavedTender> =>
  db.transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const [tender] = await tx
      .select()
      .from(tendersTable)
      .where(eq(tendersTable.id, input.tenderId))
      .limit(1);
    if (!tender) throw new NotFoundError(`Tender ${input.tenderId} was not found`);
    const [existing] = await tx
      .select()
      .from(savedTendersTable)
      .where(
        and(
          eq(savedTendersTable.userId, input.userId),
          eq(savedTendersTable.tenderId, input.tenderId),
        ),
      )
      .limit(1);
    const now = new Date();
    let saved = existing;
    if (existing) {
      if (input.monitored !== undefined && input.monitored !== existing.monitored) {
        const [updated] = await tx
          .update(savedTendersTable)
          .set({
            monitored: input.monitored,
            monitoredAt: input.monitored ? now : null,
          })
          .where(
            and(
              eq(savedTendersTable.userId, input.userId),
              eq(savedTendersTable.tenderId, input.tenderId),
            ),
          )
          .returning();
        saved = updated;
      }
    } else {
      const [totalRow] = await tx
        .select({ value: count() })
        .from(savedTendersTable)
        .where(eq(savedTendersTable.userId, input.userId));
      if (Number(totalRow?.value ?? 0) >= MAX_SAVED_TENDERS) {
        throw new ConflictError("Saved tender limit reached", [
          { field: "limit", issue: "max_saved_tenders" },
        ]);
      }
      const monitored = input.monitored ?? false;
      [saved] = await tx
        .insert(savedTendersTable)
        .values({
          userId: input.userId,
          tenderId: input.tenderId,
          savedAt: now,
          monitored,
          monitoredAt: monitored ? now : null,
        })
        .returning();
    }
    if (!saved) throw new Error("Failed to save tender");
    return toSavedTender(saved, tender);
  });

export const deleteSavedTender = async (
  userId: string,
  tenderId: string,
): Promise<void> => {
  await db
    .delete(savedTendersTable)
    .where(
      and(
        eq(savedTendersTable.userId, userId),
        eq(savedTendersTable.tenderId, tenderId),
      ),
    );
};

export const importSavedTenders = async (userId: string, ids: string[]) => {
  const uniqueIds = [...new Set(ids)];
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const existingRows =
      uniqueIds.length === 0
        ? []
        : await tx
            .select({ tenderId: savedTendersTable.tenderId })
            .from(savedTendersTable)
            .where(
              and(
                eq(savedTendersTable.userId, userId),
                inArray(savedTendersTable.tenderId, uniqueIds),
              ),
            );
    const tenderRows =
      uniqueIds.length === 0
        ? []
        : await tx
            .select({ id: tendersTable.id })
            .from(tendersTable)
            .where(inArray(tendersTable.id, uniqueIds));
    const totalRows = await tx
      .select({ value: count() })
      .from(savedTendersTable)
      .where(eq(savedTendersTable.userId, userId));
    const existing = new Set(existingRows.map(({ tenderId }) => tenderId));
    const found = new Set(tenderRows.map(({ id }) => id));
    const notFound = uniqueIds.filter((id) => !found.has(id));
    const candidates = uniqueIds.filter((id) => found.has(id) && !existing.has(id));
    const capacity = Math.max(0, MAX_SAVED_TENDERS - Number(totalRows[0]?.value ?? 0));
    const accepted = candidates.slice(0, capacity);
    const inserted =
      accepted.length === 0
        ? []
        : await tx
            .insert(savedTendersTable)
            .values(accepted.map((tenderId) => ({ userId, tenderId })))
            .onConflictDoNothing()
            .returning({ tenderId: savedTendersTable.tenderId });
    return {
      imported: inserted.length,
      alreadySaved: uniqueIds.filter((id) => existing.has(id)).length,
      notFound,
      skippedByLimit: candidates.length - accepted.length,
    };
  });
};

const assertSavedSearchOwner = async (userId: string, id: string) => {
  const [row] = await db
    .select()
    .from(savedSearchesTable)
    .where(eq(savedSearchesTable.id, id))
    .limit(1);
  if (!row) throw new NotFoundError(`Saved search ${id} was not found`);
  if (row.userId !== userId) throw new ForbiddenError();
  return row;
};

export const listSavedSearches = async (userId: string) => ({
  data: (
    await db
      .select()
      .from(savedSearchesTable)
      .where(eq(savedSearchesTable.userId, userId))
      .orderBy(desc(savedSearchesTable.updatedAt))
  ).map(toSavedSearch),
});

export const createSavedSearch = async (input: {
  userId: string;
  name: string;
  query: string;
  alertsEnabled: boolean;
}): Promise<SavedSearch> => {
  const canonical = canonicalSearchQuery(input.query).query;
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const [totalRow] = await tx
      .select({ value: count() })
      .from(savedSearchesTable)
      .where(eq(savedSearchesTable.userId, input.userId));
    if (Number(totalRow?.value ?? 0) >= MAX_SAVED_SEARCHES) {
      throw new ConflictError("Saved search limit reached", [
        { field: "limit", issue: "max_saved_searches" },
      ]);
    }
    const now = new Date();
    const [row] = await tx
      .insert(savedSearchesTable)
      .values({
        id: randomUUID(),
        userId: input.userId,
        name: input.name,
        query: canonical,
        alertsEnabled: input.alertsEnabled,
        createdAt: now,
        updatedAt: now,
        lastCheckedAt: input.alertsEnabled ? now : null,
      })
      .returning();
    if (!row) throw new Error("Failed to create saved search");
    return toSavedSearch(row);
  });
};

export const updateSavedSearch = async (input: {
  userId: string;
  id: string;
  name?: string;
  query?: string;
  alertsEnabled?: boolean;
}): Promise<SavedSearch> => {
  const existing = await assertSavedSearchOwner(input.userId, input.id);
  const query = input.query === undefined
    ? existing.query
    : canonicalSearchQuery(input.query).query;
  const alertsEnabled = input.alertsEnabled ?? existing.alertsEnabled;
  const resetCheckpoint =
    query !== existing.query || (!existing.alertsEnabled && alertsEnabled);
  const [row] = await db
    .update(savedSearchesTable)
    .set({
      name: input.name ?? existing.name,
      query,
      alertsEnabled,
      updatedAt: new Date(),
      ...(resetCheckpoint
        ? { lastCheckedAt: new Date(), newMatchesCount: 0 }
        : {}),
    })
    .where(
      and(
        eq(savedSearchesTable.id, input.id),
        eq(savedSearchesTable.userId, input.userId),
      ),
    )
    .returning();
  if (!row) throw new ForbiddenError();
  return toSavedSearch(row);
};

export const deleteSavedSearch = async (userId: string, id: string): Promise<void> => {
  await assertSavedSearchOwner(userId, id);
  await db
    .delete(savedSearchesTable)
    .where(and(eq(savedSearchesTable.id, id), eq(savedSearchesTable.userId, userId)));
};

export const markSavedSearchSeen = async (
  userId: string,
  id: string,
): Promise<SavedSearch> => {
  await assertSavedSearchOwner(userId, id);
  const [row] = await db
    .update(savedSearchesTable)
    .set({ newMatchesCount: 0, updatedAt: new Date() })
    .where(and(eq(savedSearchesTable.id, id), eq(savedSearchesTable.userId, userId)))
    .returning();
  if (!row) throw new ForbiddenError();
  return toSavedSearch(row);
};

const toNotification = (
  row: typeof notificationsTable.$inferSelect,
): Notification => ({
  id: row.id,
  type: row.type as Notification["type"],
  createdAt: row.createdAt,
  readAt: row.readAt,
  tender:
    row.tenderId && row.tenderTitle
      ? {
          id: row.tenderId,
          title: row.tenderTitle,
          tenderNumberShort: row.tenderNumberShort,
        }
      : null,
  change: row.change ?? null,
  savedSearch:
    row.savedSearchId && row.savedSearchName && row.savedSearchQuery !== null
      ? {
          id: row.savedSearchId,
          name: row.savedSearchName,
          query: row.savedSearchQuery,
        }
      : null,
  matchCount: row.matchCount,
  tenderIds: row.tenderIds,
});

export const unreadNotificationCount = async (userId: string): Promise<number> => {
  const [row] = await db
    .select({ value: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt)));
  return Number(row?.value ?? 0);
};

export const listNotifications = async (input: {
  userId: string;
  unreadOnly: boolean;
  page: number;
  pageSize: number;
}): Promise<NotificationPage> => {
  const filter = and(
    eq(notificationsTable.userId, input.userId),
    input.unreadOnly ? isNull(notificationsTable.readAt) : undefined,
  );
  const [[totalRow], rows, unreadCount] = await Promise.all([
    db.select({ value: count() }).from(notificationsTable).where(filter),
    db
      .select()
      .from(notificationsTable)
      .where(filter)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    unreadNotificationCount(input.userId),
  ]);
  const total = Number(totalRow?.value ?? 0);
  return {
    data: rows.map(toNotification),
    pagination: pagination(input.page, input.pageSize, total),
    unreadCount,
  };
};

export const markNotificationsRead = async (input: {
  userId: string;
  ids?: string[];
  all?: boolean;
}): Promise<{ unreadCount: number }> => {
  const now = new Date();
  if (input.all) {
    await db
      .update(notificationsTable)
      .set({ readAt: now })
      .where(
        and(
          eq(notificationsTable.userId, input.userId),
          isNull(notificationsTable.readAt),
        ),
      );
  } else if (input.ids && input.ids.length > 0) {
    await db
      .update(notificationsTable)
      .set({ readAt: now })
      .where(
        and(
          eq(notificationsTable.userId, input.userId),
          inArray(notificationsTable.id, input.ids),
          isNull(notificationsTable.readAt),
        ),
      );
  }
  return { unreadCount: await unreadNotificationCount(input.userId) };
};
