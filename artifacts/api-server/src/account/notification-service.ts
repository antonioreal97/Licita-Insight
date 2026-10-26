import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  companyDocumentsTable,
  emailDeliveryNotificationsTable,
  notificationsTable,
  savedSearchesTable,
  savedTendersTable,
  subscriptionsTable,
  tendersTable,
  usersTable,
} from "@workspace/db";
import type { NotificationChangeRecord } from "@workspace/db/schema";
import { searchWhereFor } from "../repositories/postgres-tender-repository";
import { logger } from "../lib/logger";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { canonicalSearchQuery } from "./saved-search-query";
import {
  tenderChanges,
  type TenderNotificationState,
} from "./notification-change";
import { TRIAL_ENDING_NOTICE_DAYS } from "../billing/trial-access";
import { hasSubscriptionEntitlement } from "../billing/billing-access";

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

/** Returns only notification snapshots owned by this user; every other id is indistinguishable from missing. */
export const notificationSearchScope = async (
  userId: string,
  notificationId: string,
): Promise<NotificationSearchScope | null> => {
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
        eq(notificationsTable.userId, userId),
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

  const inserted = await db
    .insert(notificationsTable)
    .values(
      users.map((user) => ({
        id: randomUUID(),
        userId: user.id,
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
};

export const COMPANY_DOCUMENT_NOTICE_DAYS = [15, 7, 1] as const;

/** Creates each expiry milestone once. The unique (user_id, dedupe_key) index makes retries/concurrent jobs safe. */
export const createCompanyDocumentExpiryNotifications = async (
  now = new Date(),
): Promise<number> => {
  const today = dateInSaoPaulo(now);
  const targetDates = COMPANY_DOCUMENT_NOTICE_DAYS.map((days) => {
    const date = new Date(`${today}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  });
  const documents = await db
    .select({
      id: companyDocumentsTable.id,
      userId: companyDocumentsTable.userId,
      kind: companyDocumentsTable.kind,
      expiresAt: companyDocumentsTable.expiresAt,
    })
    .from(companyDocumentsTable)
    .where(and(eq(companyDocumentsTable.status, "have"), inArray(companyDocumentsTable.expiresAt, targetDates)));
  if (documents.length === 0) return 0;
  const inserted = await db
    .insert(notificationsTable)
    .values(documents.map((document) => {
      const milestone = COMPANY_DOCUMENT_NOTICE_DAYS[targetDates.indexOf(document.expiresAt!)]!;
      return {
        id: randomUUID(),
        userId: document.userId,
        type: "company_document_expiring",
        dedupeKey: `company-document:${document.id}:${milestone}:${document.expiresAt}`,
        createdAt: now,
        change: { field: `companyDocument:${document.kind}`, from: milestone, to: document.expiresAt },
      };
    }))
    .onConflictDoNothing()
    .returning({ id: notificationsTable.id });
  return inserted.length;
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
        tenderOrganizationName: input.tender.organizationName,
        tenderProposalDeadline: input.tender.proposalDeadline,
        change,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: notificationsTable.id });
  return inserted.length;
};

/** Tender ids kept in a saved-search snapshot (`notification=<id>` link); `matchCount` keeps the full total. */
const SAVED_SEARCH_STORED_TENDER_LIMIT = 20;

const savedSearchDayKey = (savedSearchId: string, at: Date): string =>
  `saved-search:${savedSearchId}:${dateInSaoPaulo(at)}`;

/**
 * At most one `saved_search_new_matches` per saved search and Brasília day: later cycles of the same day add to
 * it (sum `matchCount`, append ids up to the cap, keeping the first ones in arrival order, mark it unread again
 * and move `createdAt` to this cycle). Once the day's notification went out in an e-mail it is frozen, so the
 * rest of the day opens a continuation (`saved-search:<id>:<day>:2`, `:3`…) for the next digest: no match is
 * left out of an e-mail and none is sent twice. A notification the user removed is frozen the same way, so it never
 * comes back. Runs under the caller's per-search advisory lock; the row lock also orders this cycle with a digest
 * linking the same notification (the digest locks it before linking).
 */
const recordSavedSearchMatches = async (
  tx: Transaction,
  input: {
    savedSearch: typeof savedSearchesTable.$inferSelect;
    matchCount: number;
    tenderIds: string[];
    completedAt: Date;
  },
): Promise<boolean> => {
  const { savedSearch, matchCount, tenderIds, completedAt } = input;
  const dayKey = savedSearchDayKey(savedSearch.id, completedAt);
  const dayRows = await tx
    .select({
      id: notificationsTable.id,
      matchCount: notificationsTable.matchCount,
      tenderIds: notificationsTable.tenderIds,
      dismissedAt: notificationsTable.dismissedAt,
    })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, savedSearch.userId),
        or(
          eq(notificationsTable.dedupeKey, dayKey),
          sql`starts_with(${notificationsTable.dedupeKey}, ${`${dayKey}:`})`,
        ),
      ),
    )
    .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.dedupeKey))
    .for("update");
  const current = dayRows[0];
  const [delivered] = current
    ? await tx
        .select({ id: emailDeliveryNotificationsTable.notificationId })
        .from(emailDeliveryNotificationsTable)
        .where(eq(emailDeliveryNotificationsTable.notificationId, current.id))
        .limit(1)
    : [];
  if (current && !delivered && !current.dismissedAt) {
    await tx
      .update(notificationsTable)
      .set({
        createdAt: completedAt,
        readAt: null,
        savedSearchName: savedSearch.name,
        savedSearchQuery: savedSearch.query,
        matchCount: (current.matchCount ?? current.tenderIds.length) + matchCount,
        tenderIds: [...new Set([...current.tenderIds, ...tenderIds])].slice(
          0,
          SAVED_SEARCH_STORED_TENDER_LIMIT,
        ),
      })
      .where(eq(notificationsTable.id, current.id));
    return true;
  }
  const inserted = await tx
    .insert(notificationsTable)
    .values({
      id: randomUUID(),
      userId: savedSearch.userId,
      type: "saved_search_new_matches",
      dedupeKey: current ? `${dayKey}:${dayRows.length + 1}` : dayKey,
      createdAt: completedAt,
      savedSearchId: savedSearch.id,
      savedSearchName: savedSearch.name,
      savedSearchQuery: savedSearch.query,
      matchCount,
      tenderIds: tenderIds.slice(0, SAVED_SEARCH_STORED_TENDER_LIMIT),
    })
    .onConflictDoNothing()
    .returning({ id: notificationsTable.id });
  return inserted.length > 0;
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
      .limit(SAVED_SEARCH_STORED_TENDER_LIMIT);
    const matchCount = Number(totalRow?.value ?? 0);
    let recorded = false;
    if (matchCount > 0) {
      recorded = await recordSavedSearchMatches(tx, {
        savedSearch,
        matchCount,
        tenderIds: matches.map(({ id: tenderId }) => tenderId),
        completedAt,
      });
    }
    await tx
      .update(savedSearchesTable)
      .set({
        lastCheckedAt: completedAt,
        ...(recorded
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
