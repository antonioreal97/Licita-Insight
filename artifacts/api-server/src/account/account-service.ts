import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
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
  pool,
  savedSearchesTable,
  savedTendersTable,
  tendersTable,
  type WorkspaceCutoverMode,
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
import { notificationScope } from "./notification-service";
import { newTenderCutoff } from "../domain/new-tender";
import { withCutoverGate, type GateDatabase } from "../workspaces/cutover-gate";
import { readCutoverState } from "../workspaces/cutover-state";
import { requireDefaultWorkspace } from "../workspaces/workspace-service";

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

/**
 * The `saved_tenders` rows a v1 route acts on: the user's in `legacy`; in `workspaces`, the default workspace's
 * (never the active one), and new rows carry its id. The key stays `(user_id, tender_id)` until W4, so nothing here
 * relies on uniqueness per workspace.
 */
const savedTenderScope = async (
  executor: Pick<typeof db, "select">,
  userId: string,
  mode: WorkspaceCutoverMode,
) => {
  if (mode === "legacy") return { filter: eq(savedTendersTable.userId, userId), values: {} };
  const { id } = await requireDefaultWorkspace(executor, userId);
  return { filter: eq(savedTendersTable.workspaceId, id), values: { workspaceId: id } };
};

const savedTenderReadScope = async (userId: string) =>
  (await savedTenderScope(db, userId, (await readCutoverState(pool)).mode)).filter;

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
    await savedTenderReadScope(input.userId),
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
    .where(await savedTenderReadScope(userId));
  return {
    saved: rows.map(({ tenderId }) => tenderId),
    monitored: rows.filter(({ monitored }) => monitored).map(({ tenderId }) => tenderId),
  };
};

export const getSavedTender = async (userId: string, tenderId: string): Promise<SavedTender> => {
  const [row] = await db.select({ saved: savedTendersTable, tender: tendersTable })
    .from(savedTendersTable).innerJoin(tendersTable, eq(savedTendersTable.tenderId, tendersTable.id))
    .where(and(await savedTenderReadScope(userId), eq(savedTendersTable.tenderId, tenderId))).limit(1);
  if (!row) throw new NotFoundError('Saved tender was not found');
  return toSavedTender(row.saved, row.tender);
};

export const putSavedTender = async (
  input: {
    userId: string;
    tenderId: string;
    monitored?: boolean;
  } & ParticipationPatch,
  database?: GateDatabase,
): Promise<SavedTender> =>
  withCutoverGate({ kind: "http" }, async (tx, state) => {
    const scope = await savedTenderScope(tx, input.userId, state.mode);
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
      .where(and(scope.filter, eq(savedTendersTable.tenderId, input.tenderId)))
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
          .where(and(scope.filter, eq(savedTendersTable.tenderId, input.tenderId)))
          .returning();
        saved = updated;
    } else {
      const [totalRow] = await tx
        .select({ value: count() })
        .from(savedTendersTable)
        .where(scope.filter);
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
          ...scope.values,
          tenderId: input.tenderId,
          savedAt: now,
          ...participation,
          monitoredAt: monitored ? now : null,
        })
        .returning();
    }
    if (!saved) throw new Error("Failed to save tender");
    return toSavedTender(saved, tender);
  }, database);

export const deleteSavedTender = async (
  userId: string,
  tenderId: string,
  database?: GateDatabase,
): Promise<void> => {
  await withCutoverGate({ kind: "http" }, async (tx, state) => {
    const scope = await savedTenderScope(tx, userId, state.mode);
    await tx
      .delete(savedTendersTable)
      .where(and(scope.filter, eq(savedTendersTable.tenderId, tenderId)));
  }, database);
};

export const importSavedTenders = async (
  userId: string,
  ids: string[],
  database?: GateDatabase,
) => {
  const uniqueIds = [...new Set(ids)];
  return withCutoverGate({ kind: "http" }, async (tx, state) => {
    const scope = await savedTenderScope(tx, userId, state.mode);
    await lockUser(tx, userId);
    const existingRows =
      uniqueIds.length === 0
        ? []
        : await tx
            .select({ tenderId: savedTendersTable.tenderId })
            .from(savedTendersTable)
            .where(and(scope.filter, inArray(savedTendersTable.tenderId, uniqueIds)));
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
      .where(scope.filter);
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
            .values(accepted.map((tenderId) => ({ userId, ...scope.values, tenderId })))
            .onConflictDoNothing()
            .returning({ tenderId: savedTendersTable.tenderId });
    return {
      imported: inserted.length,
      alreadySaved: uniqueIds.filter((id) => existing.has(id)).length,
      notFound,
      skippedByLimit: candidates.length - accepted.length,
    };
  }, database);
};

const savedSearchConflict = (existingId: string): ConflictError =>
  new ConflictError("A saved search with this query already exists", [
    { field: "query", issue: "duplicate", existingId },
  ]);

/**
 * The `saved_searches` rows a v1 route acts on, like `savedTenderScope`. The active uniqueness stays
 * `(user_id, query)` until W4, so the duplicate check never relies on the index per workspace.
 */
const savedSearchScope = async (
  executor: Pick<typeof db, "select">,
  userId: string,
  mode: WorkspaceCutoverMode,
) => {
  if (mode === "legacy") {
    return { filter: eq(savedSearchesTable.userId, userId), values: {}, workspaceId: null };
  }
  const { id } = await requireDefaultWorkspace(executor, userId);
  return { filter: eq(savedSearchesTable.workspaceId, id), values: { workspaceId: id }, workspaceId: id };
};

type SavedSearchScope = Awaited<ReturnType<typeof savedSearchScope>>;

const findDuplicateSavedSearch = async (
  tx: Transaction,
  scope: SavedSearchScope,
  query: string,
  exceptId?: string,
) => {
  const [row] = await tx
    .select({ id: savedSearchesTable.id })
    .from(savedSearchesTable)
    .where(
      and(
        scope.filter,
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
  scope: SavedSearchScope,
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
  // The owner's search outside the default workspace does not exist for the v1 routes.
  const outside = scope.workspaceId !== null && row.workspaceId !== scope.workspaceId;
  if (outside || (!includeDeleted && row.deletedAt)) {
    throw new NotFoundError(`Saved search ${id} was not found`);
  }
  return row;
};

export const listSavedSearches = async (userId: string) => {
  const scope = await savedSearchScope(db, userId, (await readCutoverState(pool)).mode);
  return {
    data: (
      await db
        .select()
        .from(savedSearchesTable)
        .where(and(scope.filter, isNull(savedSearchesTable.deletedAt)))
        .orderBy(desc(savedSearchesTable.updatedAt))
    ).map(toSavedSearch),
  };
};

export const createSavedSearch = async (
  input: {
    userId: string;
    name: string;
    query: string;
    alertsEnabled: boolean;
  },
  database?: GateDatabase,
): Promise<SavedSearch> => {
  const canonical = canonicalSearchQuery(input.query).query;
  return withCutoverGate({ kind: "http" }, async (tx, state) => {
    const scope = await savedSearchScope(tx, input.userId, state.mode);
    await lockUser(tx, input.userId);
    const duplicate = await findDuplicateSavedSearch(tx, scope, canonical);
    if (duplicate) throw savedSearchConflict(duplicate.id);
    const [totalRow] = await tx
      .select({ value: count() })
      .from(savedSearchesTable)
      .where(and(scope.filter, isNull(savedSearchesTable.deletedAt)));
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
        ...scope.values,
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
  }, database);
};

export const updateSavedSearch = async (
  input: {
    userId: string;
    id: string;
    name?: string;
    query?: string;
    alertsEnabled?: boolean;
  },
  database?: GateDatabase,
): Promise<SavedSearch> => {
  const requestedQuery =
    input.query === undefined ? undefined : canonicalSearchQuery(input.query).query;
  return withCutoverGate({ kind: "http" }, async (tx, state) => {
    const scope = await savedSearchScope(tx, input.userId, state.mode);
    await lockUser(tx, input.userId);
    const existing = await assertSavedSearchOwner(
      tx,
      scope,
      input.userId,
      input.id,
    );
    const query = requestedQuery ?? existing.query;
    const duplicate = await findDuplicateSavedSearch(
      tx,
      scope,
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
          scope.filter,
          isNull(savedSearchesTable.deletedAt),
        ),
      )
      .returning();
    if (!row) throw new ForbiddenError();
    return toSavedSearch(row);
  }, database);
};

export const deleteSavedSearch = async (
  userId: string,
  id: string,
  database?: GateDatabase,
): Promise<void> => {
  await withCutoverGate({ kind: "http" }, async (tx, state) => {
    const scope = await savedSearchScope(tx, userId, state.mode);
    await lockUser(tx, userId);
    await assertSavedSearchOwner(tx, scope, userId, id);
    const now = new Date();
    await tx
      .update(savedSearchesTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(savedSearchesTable.id, id),
          scope.filter,
          isNull(savedSearchesTable.deletedAt),
        ),
      );
  }, database);
};

export const restoreSavedSearch = async (
  userId: string,
  id: string,
  database?: GateDatabase,
): Promise<SavedSearch> =>
  withCutoverGate({ kind: "http" }, async (tx, state) => {
    const scope = await savedSearchScope(tx, userId, state.mode);
    await lockUser(tx, userId);
    const existing = await assertSavedSearchOwner(tx, scope, userId, id, true);
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
      scope,
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
      .where(and(eq(savedSearchesTable.id, id), scope.filter))
      .returning();
    if (!row) throw new NotFoundError(`Saved search ${id} was not found`);
    return toSavedSearch(row);
  }, database);

export const markSavedSearchSeen = async (
  userId: string,
  id: string,
  database?: GateDatabase,
): Promise<SavedSearch> =>
  withCutoverGate({ kind: "http" }, async (tx, state) => {
    const scope = await savedSearchScope(tx, userId, state.mode);
    await lockUser(tx, userId);
    await assertSavedSearchOwner(tx, scope, userId, id);
    const [row] = await tx
      .update(savedSearchesTable)
      .set({ newMatchesCount: 0, updatedAt: new Date() })
      .where(
        and(
          eq(savedSearchesTable.id, id),
          scope.filter,
          isNull(savedSearchesTable.deletedAt),
        ),
      )
      .returning();
    if (!row) throw new ForbiddenError();
    return toSavedSearch(row);
  }, database);

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

type NotificationScope = Awaited<ReturnType<typeof notificationScope>>;

const notificationReadScope = async (userId: string) =>
  notificationScope(db, userId, (await readCutoverState(pool)).mode);

const countUnreadNotifications = async (
  executor: Pick<typeof db, "select">,
  scope: NotificationScope,
): Promise<number> => {
  const [row] = await executor
    .select({ value: count() })
    .from(notificationsTable)
    .where(and(scope, isNull(notificationsTable.readAt)));
  return Number(row?.value ?? 0);
};

export const unreadNotificationCount = async (userId: string): Promise<number> =>
  countUnreadNotifications(db, await notificationReadScope(userId));

export const listNotifications = async (input: {
  userId: string;
  unreadOnly: boolean;
  page: number;
  pageSize: number;
}): Promise<NotificationPage> => {
  const now = new Date();
  const scope = await notificationReadScope(input.userId);
  const filter = and(
    scope,
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
    countUnreadNotifications(db, scope),
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

export const markNotificationsRead = async (
  input: {
    userId: string;
    ids?: string[];
    all?: boolean;
  },
  database?: GateDatabase,
): Promise<{ unreadCount: number }> =>
  withCutoverGate({ kind: "http" }, async (tx, state) => {
    const scope = await notificationScope(tx, input.userId, state.mode);
    const now = new Date();
    if (input.all) {
      await tx
        .update(notificationsTable)
        .set({ readAt: now })
        .where(and(scope, isNull(notificationsTable.readAt)));
    } else if (input.ids && input.ids.length > 0) {
      await tx
        .update(notificationsTable)
        .set({ readAt: now })
        .where(
          and(
            scope,
            inArray(notificationsTable.id, input.ids),
            isNull(notificationsTable.readAt),
          ),
        );
    }
    return { unreadCount: await countUnreadNotifications(tx, scope) };
  }, database);
