import { and, eq, gt, isNull } from "drizzle-orm";
import {
  db,
  notificationsTable,
  savedSearchesTable,
  savedTendersTable,
  sessionsTable,
  subscriptionsTable,
  usersTable,
} from "@workspace/db";
import { deleteSubscription } from "../billing/asaas-client";
import { NotFoundError } from "../lib/api-error";
import { logger } from "../lib/logger";

export async function exportAccountData(userId: string, now = new Date()) {
  const [users, sessions, savedTenders, savedSearches, notifications, subscriptions] =
    await Promise.all([
      db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          name: usersTable.name,
          avatarUrl: usersTable.avatarUrl,
          createdAt: usersTable.createdAt,
          updatedAt: usersTable.updatedAt,
        })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1),
      db
        .select({
          createdAt: sessionsTable.createdAt,
          lastSeenAt: sessionsTable.lastSeenAt,
          expiresAt: sessionsTable.expiresAt,
        })
        .from(sessionsTable)
        .where(
          and(
            eq(sessionsTable.userId, userId),
            isNull(sessionsTable.revokedAt),
            gt(sessionsTable.expiresAt, now),
          ),
        ),
      db
        .select({
          tenderId: savedTendersTable.tenderId,
          savedAt: savedTendersTable.savedAt,
          monitored: savedTendersTable.monitored,
          monitoredAt: savedTendersTable.monitoredAt,
        })
        .from(savedTendersTable)
        .where(eq(savedTendersTable.userId, userId)),
      db
        .select({
          id: savedSearchesTable.id,
          name: savedSearchesTable.name,
          query: savedSearchesTable.query,
          alertsEnabled: savedSearchesTable.alertsEnabled,
          createdAt: savedSearchesTable.createdAt,
          updatedAt: savedSearchesTable.updatedAt,
          deletedAt: savedSearchesTable.deletedAt,
          lastCheckedAt: savedSearchesTable.lastCheckedAt,
          newMatchesCount: savedSearchesTable.newMatchesCount,
        })
        .from(savedSearchesTable)
        .where(eq(savedSearchesTable.userId, userId)),
      db
        .select({
          id: notificationsTable.id,
          type: notificationsTable.type,
          createdAt: notificationsTable.createdAt,
          readAt: notificationsTable.readAt,
          tenderId: notificationsTable.tenderId,
          tenderTitle: notificationsTable.tenderTitle,
          tenderNumberShort: notificationsTable.tenderNumberShort,
          change: notificationsTable.change,
          savedSearchId: notificationsTable.savedSearchId,
          savedSearchName: notificationsTable.savedSearchName,
          savedSearchQuery: notificationsTable.savedSearchQuery,
          matchCount: notificationsTable.matchCount,
          tenderIds: notificationsTable.tenderIds,
        })
        .from(notificationsTable)
        .where(eq(notificationsTable.userId, userId)),
      db
        .select({
          status: subscriptionsTable.status,
          currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
          updatedAt: subscriptionsTable.updatedAt,
        })
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.userId, userId))
        .limit(1),
    ]);

  const user = users[0];
  if (!user) throw new NotFoundError("Account was not found");

  return {
    exportedAt: now,
    user,
    sessions,
    savedTenders,
    savedSearches,
    notifications,
    subscription: subscriptions[0] ?? null,
  };
}

type DeleteAccountDependencies = {
  cancelAsaasSubscription: (subscriptionId: string) => Promise<void>;
  deleteLocalAccount: (userId: string) => Promise<void>;
};

const defaultDeleteAccountDependencies: DeleteAccountDependencies = {
  cancelAsaasSubscription: deleteSubscription,
  deleteLocalAccount: async (userId) => {
    await db.transaction(async (tx) => {
      await tx.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
      await tx
        .delete(savedTendersTable)
        .where(eq(savedTendersTable.userId, userId));
      await tx
        .delete(savedSearchesTable)
        .where(eq(savedSearchesTable.userId, userId));
      await tx
        .delete(notificationsTable)
        .where(eq(notificationsTable.userId, userId));
      await tx
        .delete(subscriptionsTable)
        .where(eq(subscriptionsTable.userId, userId));
      const deleted = await tx
        .delete(usersTable)
        .where(eq(usersTable.id, userId))
        .returning({ id: usersTable.id });
      if (deleted.length === 0) throw new NotFoundError("Account was not found");
    });
  },
};

export async function deleteAccount(
  userId: string,
  dependencies: Partial<DeleteAccountDependencies> = {},
): Promise<void> {
  const cancelAsaasSubscription =
    dependencies.cancelAsaasSubscription ??
    defaultDeleteAccountDependencies.cancelAsaasSubscription;
  const deleteLocalAccount =
    dependencies.deleteLocalAccount ??
    defaultDeleteAccountDependencies.deleteLocalAccount;
  const [subscription] = await db
    .select({
      status: subscriptionsTable.status,
      asaasSubscriptionId: subscriptionsTable.asaasSubscriptionId,
    })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .limit(1);

  const remoteSubscriptionId =
    subscription?.status === "canceled"
      ? null
      : (subscription?.asaasSubscriptionId ?? null);
  if (remoteSubscriptionId) {
    await cancelAsaasSubscription(remoteSubscriptionId);
  }

  try {
    await deleteLocalAccount(userId);
  } catch (error) {
    if (remoteSubscriptionId) {
      try {
        await db
          .update(subscriptionsTable)
          .set({ status: "canceled", updatedAt: new Date() })
          .where(eq(subscriptionsTable.userId, userId));
      } catch (compensationError) {
        logger.error(
          { err: compensationError, userId },
          "Failed to record the remote subscription cancellation after account deletion rollback",
        );
      }
    }
    throw error;
  }
}
