import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
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
import { participationUpdate, type ParticipationPatch } from './participation';
import { newTenderCutoff } from "../domain/new-tender";

const MAX_SAVED_TENDERS = 500;
const MAX_SAVED_SEARCHES = 50;
const SAVED_SEARCH_RESTORE_WINDOW_MS = 30_000;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  platform: [],
  newOnly: false,
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
  stage: saved.stage,
  stageAt: saved.stageAt,
  participationSource: 'user',
  protocol: saved.protocol,
  nextAction: saved.nextAction,
  nextActionDeadline: saved.nextActionDeadline,
  checklist: saved.checklist.map(item => ({ ...item, key: item.key as SavedTender['checklist'][number]['key'], updatedAt: new Date(item.updatedAt) })),
  history: saved.history.map(item => ({ ...item, at: new Date(item.at) })),
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

const lockUser = async (tx: Transaction, userId: string) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
};

export const listSavedTenders = async (input: {
  userId: string;
  page: number;
  pageSize: number;
  monitored?: boolean;
  stage?: ParticipationPatch['stage'];
  sort?: 'saved_at' | 'deadline';
  upcoming?: boolean;
}): Promise<SavedTenderPage> => {
  const filter = and(
    eq(savedTendersTable.userId, input.userId),
    input.monitored === undefined
      ? undefined
      : eq(savedTendersTable.monitored, input.monitored),
    input.stage === undefined ? undefined : eq(savedTendersTable.stage, input.stage),
    input.upcoming ? gt(tendersTable.proposalDeadline, new Date()) : undefined,
  );
  const [[totalRow], rows] = await Promise.all([
    db.select({ value: count() }).from(savedTendersTable).innerJoin(tendersTable, eq(savedTendersTable.tenderId, tendersTable.id)).where(filter),
    db
      .select({ saved: savedTendersTable, tender: tendersTable })
      .from(savedTendersTable)
      .innerJoin(tendersTable, eq(savedTendersTable.tenderId, tendersTable.id))
      .where(filter)
      .orderBy(...(input.sort === 'deadline' ? [sql`${tendersTable.proposalDeadline} asc nulls last`, asc(savedTendersTable.tenderId)] : [desc(savedTendersTable.savedAt), asc(savedTendersTable.tenderId)]))
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

export const getSavedTender = async (userId: string, tenderId: string): Promise<SavedTender> => {
  const [row] = await db.select({ saved: savedTendersTable, tender: tendersTable })
    .from(savedTendersTable).innerJoin(tendersTable, eq(savedTendersTable.tenderId, tendersTable.id))
    .where(and(eq(savedTendersTable.userId, userId), eq(savedTendersTable.tenderId, tenderId))).limit(1);
  if (!row) throw new NotFoundError('Saved tender was not found');
  return toSavedTender(row.saved, row.tender);
};

export const putSavedTender = async (input: {
  userId: string;
  tenderId: string;
  monitored?: boolean;
} & ParticipationPatch): Promise<SavedTender> =>
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
    const participation = participationUpdate(existing, input, now);
    let saved = existing;
    if (existing) {
        const [updated] = await tx
          .update(savedTendersTable)
          .set({
            ...participation,
            monitoredAt: participation.monitored ? (existing.monitoredAt ?? now) : null,
          })
          .where(
            and(
              eq(savedTendersTable.userId, input.userId),
              eq(savedTendersTable.tenderId, input.tenderId),
            ),
          )
          .returning();
        saved = updated;
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
      const monitored = participation.monitored;
      [saved] = await tx
        .insert(savedTendersTable)
        .values({
          userId: input.userId,
          tenderId: input.tenderId,
          savedAt: now,
          ...participation,
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

const savedSearchConflict = (existingId: string): ConflictError =>
  new ConflictError("A saved search with this query already exists", [
    { field: "query", issue: "duplicate", existingId },
  ]);

const findDuplicateSavedSearch = async (
  tx: Transaction,
  userId: string,
  query: string,
  exceptId?: string,
) => {
  const [row] = await tx
    .select({ id: savedSearchesTable.id })
    .from(savedSearchesTable)
    .where(
      and(
        eq(savedSearchesTable.userId, userId),
        eq(savedSearchesTable.query, query),
        isNull(savedSearchesTable.deletedAt),
        exceptId ? ne(savedSearchesTable.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return row;
};

const assertSavedSearchOwner = async (
  tx: Transaction,
  userId: string,
  id: string,
  includeDeleted = false,
) => {
  const [row] = await tx
    .select()
    .from(savedSearchesTable)
    .where(eq(savedSearchesTable.id, id))
    .limit(1);
  if (!row) throw new NotFoundError(`Saved search ${id} was not found`);
  if (row.userId !== userId) throw new ForbiddenError();
  if (!includeDeleted && row.deletedAt) {
    throw new NotFoundError(`Saved search ${id} was not found`);
  }
  return row;
};

export const listSavedSearches = async (userId: string) => ({
  data: (
    await db
      .select()
      .from(savedSearchesTable)
      .where(
        and(
          eq(savedSearchesTable.userId, userId),
          isNull(savedSearchesTable.deletedAt),
        ),
      )
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
    const duplicate = await findDuplicateSavedSearch(
      tx,
      input.userId,
      canonical,
    );
    if (duplicate) throw savedSearchConflict(duplicate.id);
    const [totalRow] = await tx
      .select({ value: count() })
      .from(savedSearchesTable)
      .where(
        and(
          eq(savedSearchesTable.userId, input.userId),
          isNull(savedSearchesTable.deletedAt),
        ),
      );
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
  const requestedQuery =
    input.query === undefined ? undefined : canonicalSearchQuery(input.query).query;
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const existing = await assertSavedSearchOwner(
      tx,
      input.userId,
      input.id,
    );
    const query = requestedQuery ?? existing.query;
    const duplicate = await findDuplicateSavedSearch(
      tx,
      input.userId,
      query,
      input.id,
    );
    if (duplicate) throw savedSearchConflict(duplicate.id);
    const alertsEnabled = input.alertsEnabled ?? existing.alertsEnabled;
    const resetCheckpoint =
      query !== existing.query || (!existing.alertsEnabled && alertsEnabled);
    const [row] = await tx
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
          isNull(savedSearchesTable.deletedAt),
        ),
      )
      .returning();
    if (!row) throw new ForbiddenError();
    return toSavedSearch(row);
  });
};

export const deleteSavedSearch = async (userId: string, id: string): Promise<void> => {
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await assertSavedSearchOwner(tx, userId, id);
    const now = new Date();
    await tx
      .update(savedSearchesTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(savedSearchesTable.id, id),
          eq(savedSearchesTable.userId, userId),
          isNull(savedSearchesTable.deletedAt),
        ),
      );
  });
};

export const restoreSavedSearch = async (
  userId: string,
  id: string,
): Promise<SavedSearch> =>
  db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const existing = await assertSavedSearchOwner(tx, userId, id, true);
    if (!existing.deletedAt) return toSavedSearch(existing);
    const now = new Date();
    if (
      existing.deletedAt.getTime() <
      now.getTime() - SAVED_SEARCH_RESTORE_WINDOW_MS
    ) {
      throw new ConflictError("Saved search restore window expired", [
        { field: "id", issue: "restore_expired" },
      ]);
    }
    const duplicate = await findDuplicateSavedSearch(
      tx,
      userId,
      existing.query,
      id,
    );
    if (duplicate) throw savedSearchConflict(duplicate.id);
    const [row] = await tx
      .update(savedSearchesTable)
      .set({
        deletedAt: null,
        updatedAt: now,
        newMatchesCount: 0,
        lastCheckedAt: existing.alertsEnabled ? now : null,
      })
      .where(
        and(
          eq(savedSearchesTable.id, id),
          eq(savedSearchesTable.userId, userId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError(`Saved search ${id} was not found`);
    return toSavedSearch(row);
  });

export const markSavedSearchSeen = async (
  userId: string,
  id: string,
): Promise<SavedSearch> =>
  db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await assertSavedSearchOwner(tx, userId, id);
    const [row] = await tx
      .update(savedSearchesTable)
      .set({ newMatchesCount: 0, updatedAt: new Date() })
      .where(
        and(
          eq(savedSearchesTable.id, id),
          eq(savedSearchesTable.userId, userId),
          isNull(savedSearchesTable.deletedAt),
        ),
      )
      .returning();
    if (!row) throw new ForbiddenError();
    return toSavedSearch(row);
  });

const toNotification = (
  row: typeof notificationsTable.$inferSelect,
  newTenderIds: ReadonlySet<string>,
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
          isNew: newTenderIds.has(row.tenderId),
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
  newMatchCount: row.tenderIds.length > 0
    ? row.tenderIds.filter((id) => newTenderIds.has(id)).length
    : row.tenderId && newTenderIds.has(row.tenderId) ? 1 : 0,
  tenderIds: row.tenderIds,
  profileMatches: row.profileMatches,
});

export const unreadNotificationCount = async (userId: string): Promise<number> => {
  const [row] = await db
    .select({ value: count() })
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.userId, userId),
      isNull(notificationsTable.readAt),
      isNull(notificationsTable.dismissedAt),
    ));
  return Number(row?.value ?? 0);
};

export const listNotifications = async (input: {
  userId: string;
  unreadOnly: boolean;
  page: number;
  pageSize: number;
}): Promise<NotificationPage> => {
  const now = new Date();
  const filter = and(
    eq(notificationsTable.userId, input.userId),
    isNull(notificationsTable.dismissedAt),
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
  const linkedTenderIds = [
    ...new Set(
      rows.flatMap((row) => [
        ...(row.tenderId ? [row.tenderId] : []),
        ...row.tenderIds,
      ]),
    ),
  ];
  const newRows = linkedTenderIds.length === 0
    ? []
    : await db
        .select({ id: tendersTable.id })
        .from(tendersTable)
        .where(and(
          inArray(tendersTable.id, linkedTenderIds),
          gt(tendersTable.createdAt, newTenderCutoff(now)),
          lte(tendersTable.createdAt, now),
        ));
  const newTenderIds = new Set(newRows.map(({ id }) => id));
  return {
    data: rows.map((row) => toNotification(row, newTenderIds)),
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
          isNull(notificationsTable.dismissedAt),
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

/**
 * Removes notifications from the feed (`{ ids }`, or `{ allRead: true }` for every read one). A soft delete: the
 * row keeps its dedupe key, so producers cannot create the same notification again. Ids of other users are ignored.
 * Every row of one call shares `dismissedAt`, which `restoreNotifications` accepts to undo the whole call.
 */
export const dismissNotifications = async (input: {
  userId: string;
  ids?: string[];
  allRead?: boolean;
}): Promise<{ dismissedCount: number; dismissedAt: Date | null; unreadCount: number }> => {
  const now = new Date();
  const target = input.allRead
    ? isNotNull(notificationsTable.readAt)
    : input.ids && input.ids.length > 0
      ? inArray(notificationsTable.id, input.ids)
      : undefined;
  const dismissed = target
    ? await db
        .update(notificationsTable)
        .set({ dismissedAt: now })
        .where(and(
          eq(notificationsTable.userId, input.userId),
          isNull(notificationsTable.dismissedAt),
          target,
        ))
        .returning({ id: notificationsTable.id })
    : [];
  return {
    dismissedCount: dismissed.length,
    dismissedAt: dismissed.length > 0 ? now : null,
    unreadCount: await unreadNotificationCount(input.userId),
  };
};

/** Undoes `dismissNotifications`: `{ ids }`, or `{ dismissedAt }` from its response. Ids of other users are ignored. */
export const restoreNotifications = async (input: {
  userId: string;
  ids?: string[];
  dismissedAt?: Date;
}): Promise<{ restoredCount: number; unreadCount: number }> => {
  const target = input.dismissedAt
    ? eq(notificationsTable.dismissedAt, input.dismissedAt)
    : input.ids && input.ids.length > 0
      ? inArray(notificationsTable.id, input.ids)
      : undefined;
  const restored = target
    ? await db
        .update(notificationsTable)
        .set({ dismissedAt: null })
        .where(and(
          eq(notificationsTable.userId, input.userId),
          isNotNull(notificationsTable.dismissedAt),
          target,
        ))
        .returning({ id: notificationsTable.id })
    : [];
  return {
    restoredCount: restored.length,
    unreadCount: await unreadNotificationCount(input.userId),
  };
};
