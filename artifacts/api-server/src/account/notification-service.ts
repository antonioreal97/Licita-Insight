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
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  notificationsTable,
  pool,
  savedSearchesTable,
  savedTendersTable,
  subscriptionsTable,
  tendersTable,
  usersTable,
  type WorkspaceCutoverMode,
} from "@workspace/db";
import type { NotificationChangeRecord } from "@workspace/db/schema";
import { searchWhereFor } from "../repositories/postgres-tender-repository";
import { logger } from "../lib/logger";
import { canonicalSearchQuery } from "./saved-search-query";
import {
  tenderChanges,
  type TenderNotificationState,
} from "./notification-change";
import { TRIAL_ENDING_NOTICE_DAYS } from "../billing/trial-access";
import { hasSubscriptionEntitlement } from "../billing/billing-access";
import { enterCutoverGate, withCutoverGate } from "../workspaces/cutover-gate";
import { readCutoverState } from "../workspaces/cutover-state";
import {
  cycleCaller,
  discardedByCutover,
  requireCutoverCycle,
  startCutoverCycle,
  type CutoverCycle,
} from "../workspaces/cutover-cycle";
import { defaultWorkspaceId, requireDefaultWorkspace } from "../workspaces/workspace-service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NotificationSearchScope = {
  tenderIds: string[];
  context: {
    id: string;
    type: "saved_search_new_matches" | "profile_new_matches";
    createdAt: Date;
    matchCount: number;
    storedTenderCount: number;
    savedSearchName: string | null;
    savedSearchQuery: string | null;
  };
};

/**
 * The notifications a v1 route acts on: the user's in `legacy`; in `workspaces`, the default workspace's (never the
 * active one). A row without a workspace (written by a version before the jobs stamped it, or not yet assigned by
 * the cutover delta) stays in the feed instead of vanishing; W4 forbids such rows and retires this branch.
 */
export const notificationScope = async (
  executor: Pick<typeof db, "select">,
  userId: string,
  mode: WorkspaceCutoverMode,
) => {
  const own = eq(notificationsTable.userId, userId);
  if (mode === "legacy") return own;
  const { id } = await requireDefaultWorkspace(executor, userId);
  return and(own, or(eq(notificationsTable.workspaceId, id), isNull(notificationsTable.workspaceId)))!;
};

/** Returns only notification snapshots owned by this user; every other id is indistinguishable from missing. */
export const notificationSearchScope = async (
  userId: string,
  notificationId: string,
  workspaceId?: string,
): Promise<NotificationSearchScope | null> => {
  const scope = workspaceId
    ? and(eq(notificationsTable.userId, userId), eq(notificationsTable.workspaceId, workspaceId))!
    : await notificationScope(db, userId, (await readCutoverState(pool)).mode);
  const [row] = await db
    .select({
      id: notificationsTable.id,
      type: notificationsTable.type,
      createdAt: notificationsTable.createdAt,
      matchCount: notificationsTable.matchCount,
      tenderIds: notificationsTable.tenderIds,
      savedSearchName: notificationsTable.savedSearchName,
      savedSearchQuery: notificationsTable.savedSearchQuery,
    })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.id, notificationId),
        scope,
        sql`${notificationsTable.type} in ('saved_search_new_matches', 'profile_new_matches')`,
      ),
    )
    .limit(1);
  if (!row) return null;
  const type = row.type as NotificationSearchScope["context"]["type"];
  return {
    tenderIds: row.tenderIds,
    context: {
      id: row.id,
      type,
      createdAt: row.createdAt,
      matchCount: row.matchCount ?? row.tenderIds.length,
      storedTenderCount: row.tenderIds.length,
      savedSearchName: row.savedSearchName,
      savedSearchQuery: row.savedSearchQuery,
    },
  };
};

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 24);

export const createTrialEndingNotifications = async (
  now = new Date(),
): Promise<number> => {
  const cycle = await startCutoverCycle("trial_notifications");
  if (!cycle) return 0;
  const { mode } = cycle;
  const noticeLimit = new Date(
    now.getTime() + TRIAL_ENDING_NOTICE_DAYS * 24 * 60 * 60 * 1000,
  );
  const candidates = await db
    .select({
      id: usersTable.id,
      trialEndsAt: usersTable.trialEndsAt,
      subscriptionStatus: subscriptionsTable.status,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
    })
    .from(usersTable)
    .leftJoin(
      subscriptionsTable,
      eq(subscriptionsTable.userId, usersTable.id),
    )
    .where(
      and(
        gt(usersTable.trialEndsAt, now),
        lte(usersTable.trialEndsAt, noticeLimit),
      ),
    );
  const users = candidates.filter(
    (user) =>
      !hasSubscriptionEntitlement(
        {
          status: user.subscriptionStatus,
          currentPeriodEnd: user.currentPeriodEnd,
        },
        now,
      ),
  );
  if (users.length === 0) return 0;

  try {
    return await withCutoverGate(cycleCaller(cycle), async (tx) => {
      const inserted = await tx
        .insert(notificationsTable)
        .values(
          users.map((user) => ({
            id: randomUUID(),
            userId: user.id,
            // An account notice belongs to the default workspace; the dedupe key keeps its legacy text until W4.
            ...(mode === "workspaces" ? { workspaceId: defaultWorkspaceId(user.id) } : {}),
            type: "trial_ending",
            dedupeKey: "account:trial-ending",
            createdAt: now,
            change: {
              field: "trialEndsAt",
              from: null,
              to: user.trialEndsAt.toISOString(),
            },
          })),
        )
        .onConflictDoNothing()
        .returning({ id: notificationsTable.id });
      return inserted.length;
    });
  } catch (error) {
    if (discardedByCutover(error, "trial_notifications")) return 0;
    throw error;
  }
};

/**
 * Who monitors the tender, read behind the gate. The collection's transaction is not a gated one, and most changed
 * tenders have nobody monitoring them, so the gate is taken only when a notification will be written: this step is
 * then a cycle of its own. It does not start while the cutover pauses writes — the error rolls the tender's
 * transaction back and the next collection finds the same change — and in `workspaces` each notification takes the
 * workspace of the saved tender that asked for it. The dedupe keys keep their legacy text until W4.
 */
const monitoringSubscribers = async (
  tx: Transaction,
  tenderId: string,
  operation: string,
): Promise<Array<{ userId: string; workspace: { workspaceId?: string | null } }>> => {
  const monitored = and(
    eq(savedTendersTable.tenderId, tenderId),
    eq(savedTendersTable.monitored, true),
  );
  const [anyone] = await tx
    .select({ userId: savedTendersTable.userId })
    .from(savedTendersTable)
    .where(monitored)
    .limit(1);
  if (!anyone) return [];
  const cycle = await requireCutoverCycle(operation);
  await enterCutoverGate(tx, cycleCaller(cycle));
  const rows = await tx
    .select({
      userId: savedTendersTable.userId,
      workspaceId: savedTendersTable.workspaceId,
    })
    .from(savedTendersTable)
    .where(monitored);
  return rows.map(({ userId, workspaceId }) => ({
    userId,
    workspace: cycle.mode === "workspaces" ? { workspaceId } : {},
  }));
};

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
  const subscribers = await monitoringSubscribers(tx, input.next.id, "tender_change_notifications");
  if (subscribers.length === 0) return 0;

  const inserted = await tx
    .insert(notificationsTable)
    .values(
      subscribers.flatMap(({ userId, workspace }) =>
        changes.map(({ type, change }) => ({
          id: randomUUID(),
          userId,
          ...workspace,
          type,
          dedupeKey: `tender:${input.next.id}:${change.field}:${digest(input.sourceVersion)}:${digest(JSON.stringify(change))}`,
          createdAt: input.detectedAt,
          tenderId: input.next.id,
          tenderTitle: input.next.title,
          tenderNumberShort: input.next.tenderNumberShort,
          tenderOrganizationName: input.next.organizationName,
          tenderProposalDeadline: input.next.proposalDeadline,
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
    tender: Pick<
      TenderNotificationState,
      | "id"
      | "title"
      | "tenderNumberShort"
      | "organizationName"
      | "proposalDeadline"
    >;
    previousCount: number;
    nextCount: number;
    addedDocumentIds: string[];
    detectedAt: Date;
  },
): Promise<number> => {
  if (input.addedDocumentIds.length === 0) return 0;
  const subscribers = await monitoringSubscribers(tx, input.tender.id, "tender_document_notifications");
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
      subscribers.map(({ userId, workspace }) => ({
        id: randomUUID(),
        userId,
        ...workspace,
        type: "tender_document_added",
        dedupeKey: `tender:${input.tender.id}:documents:${version}`,
        createdAt: input.detectedAt,
        tenderId: input.tender.id,
        tenderTitle: input.tender.title,
        tenderNumberShort: input.tender.tenderNumberShort,
        tenderOrganizationName: input.tender.organizationName,
        tenderProposalDeadline: input.tender.proposalDeadline,
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
  cycle: CutoverCycle,
): Promise<void> => {
  await withCutoverGate(cycleCaller(cycle), async (tx) => {
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
      searchWhereFor(criteria, undefined, completedAt),
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
          // The alert belongs to the workspace of its saved search; the dedupe key keeps its legacy text until W4.
          ...(cycle.mode === "workspaces" ? { workspaceId: savedSearch.workspaceId } : {}),
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
  const cycle = await startCutoverCycle("saved_search_evaluation");
  if (!cycle) return;
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
      await evaluateSavedSearch(id, completedAt, cycle);
    } catch (error) {
      if (discardedByCutover(error, "saved_search_evaluation")) return;
      logger.error({ err: error, savedSearchId: id }, "Saved search evaluation failed");
      throw error;
    }
  }
  try {
    await withCutoverGate(cycleCaller(cycle), (tx) =>
      tx
        .delete(notificationsTable)
        .where(
          lt(
            notificationsTable.createdAt,
            new Date(completedAt.getTime() - 90 * 24 * 60 * 60 * 1000),
          ),
        ),
    );
  } catch (error) {
    if (!discardedByCutover(error, "saved_search_evaluation")) throw error;
  }
};
