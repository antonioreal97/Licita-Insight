import { eq, inArray } from "drizzle-orm";
import {
  aiAskRequestsTable,
  aiDailyTendersTable,
  aiDailyUsageTable,
  aiFitDailyUsageTable,
  aiJobsTable,
  betaAccessGrantsTable,
  couponCodesTable,
  couponRedemptionsTable,
  companyProfilesTable,
  companyTenderFitsTable,
  db,
  emailDeliveriesTable,
  emailDeliveryNotificationsTable,
  googleTrialTombstonesTable,
  notificationsTable,
  recommendationDismissalsTable,
  recommendationEventsTable,
  recommendationInterestProfilesTable,
  userRecommendationsTable,
  savedSearchesTable,
  savedTendersTable,
  sessionsTable,
  subscriptionsTable,
  usersTable,
} from "@workspace/db";
import { sessionSecret } from "../auth/config";
import { deleteSubscription } from "../billing/asaas-client";
import { googleTrialSubjectHash } from "../billing/trial-access";
import { NotFoundError } from "../lib/api-error";
import { logger } from "../lib/logger";

/** Registry checked against information_schema in the integration test. */
export const ACCOUNT_EXPORT_TABLES = {
  sessions: "sessions",
  saved_tenders: "savedTenders",
  saved_searches: "savedSearches",
  notifications: "notifications",
  email_deliveries: "emailDeliveries",
  subscriptions: "subscription",
  coupon_redemptions: "couponRedemptions",
  ai_daily_usage: "aiDailyUsage",
  ai_daily_tenders: "aiDailyTenders",
  ai_ask_requests: "aiQuestions",
  company_profiles: "companyProfile",
  company_tender_fits: "companyFits",
  ai_fit_daily_usage: "fitUsage",
  recommendation_events: "recommendationEvents",
  recommendation_dismissals: "recommendationDismissals",
  recommendation_interest_profiles: "recommendationInterestProfile",
  user_recommendations: "recommendations",
  ai_jobs: "aiJobs",
} as const;

export async function exportAccountData(userId: string, now = new Date()) {
  const [users, sessions, savedTenders, savedSearches, notifications, subscriptions, couponRedemptions, emailDeliveries, aiQuestions, aiDailyUsage, aiDailyTenders, aiJobs, companyProfiles, companyFits, fitUsage, recommendationEvents, recommendationDismissals, recommendationInterest, recommendations] =
    await Promise.all([
      db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          name: usersTable.name,
          avatarUrl: usersTable.avatarUrl,
          trialEndsAt: usersTable.trialEndsAt,
          emailDigest: usersTable.emailDigest,
          emailImmediateCritical: usersTable.emailImmediateCritical,
          profileAlerts: usersTable.profileAlerts,
          recommendationPersonalizationEnabled: usersTable.recommendationPersonalizationEnabled,
          showInternationalOpportunities: usersTable.showInternationalOpportunities,
          recommendationPreferencesUpdatedAt: usersTable.recommendationPreferencesUpdatedAt,
          emailPreferencesUpdatedAt: usersTable.emailPreferencesUpdatedAt,
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
          revokedAt: sessionsTable.revokedAt,
        })
        .from(sessionsTable)
        .where(eq(sessionsTable.userId, userId)),
      db
        .select({
          tenderId: savedTendersTable.tenderId,
          savedAt: savedTendersTable.savedAt,
          monitored: savedTendersTable.monitored,
          monitoredAt: savedTendersTable.monitoredAt,
          stage: savedTendersTable.stage,
          stageAt: savedTendersTable.stageAt,
          protocol: savedTendersTable.protocol,
          nextAction: savedTendersTable.nextAction,
          nextActionDeadline: savedTendersTable.nextActionDeadline,
          checklist: savedTendersTable.checklist,
          history: savedTendersTable.history,
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
          tenderOrganizationName: notificationsTable.tenderOrganizationName,
          tenderProposalDeadline: notificationsTable.tenderProposalDeadline,
          change: notificationsTable.change,
          savedSearchId: notificationsTable.savedSearchId,
          savedSearchName: notificationsTable.savedSearchName,
          savedSearchQuery: notificationsTable.savedSearchQuery,
          matchCount: notificationsTable.matchCount,
          tenderIds: notificationsTable.tenderIds,
          profileMatches: notificationsTable.profileMatches,
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
      db
        .select({
          couponId: couponRedemptionsTable.couponId,
          redeemedAt: couponRedemptionsTable.redeemedAt,
          accessUntil: couponRedemptionsTable.accessUntil,
          durationDays: couponCodesTable.durationDays,
        })
        .from(couponRedemptionsTable)
        .innerJoin(couponCodesTable, eq(couponCodesTable.id, couponRedemptionsTable.couponId))
        .where(eq(couponRedemptionsTable.userId, userId)),
      db
        .select({
          id: emailDeliveriesTable.id,
          mode: emailDeliveriesTable.mode,
          status: emailDeliveriesTable.status,
          recipientEmail: emailDeliveriesTable.recipientEmail,
          subject: emailDeliveriesTable.subject,
          htmlBody: emailDeliveriesTable.htmlBody,
          textBody: emailDeliveriesTable.textBody,
          attempts: emailDeliveriesTable.attempts,
          lastError: emailDeliveriesTable.lastError,
          providerMessageId: emailDeliveriesTable.providerMessageId,
          createdAt: emailDeliveriesTable.createdAt,
          updatedAt: emailDeliveriesTable.updatedAt,
          sentAt: emailDeliveriesTable.sentAt,
        })
        .from(emailDeliveriesTable)
        .where(eq(emailDeliveriesTable.userId, userId)),
      db
        .select({
          id: aiAskRequestsTable.id,
          tenderId: aiAskRequestsTable.tenderId,
          question: aiAskRequestsTable.question,
          status: aiAskRequestsTable.status,
          passages: aiAskRequestsTable.passages,
          summary: aiAskRequestsTable.summary,
          requestedModel: aiAskRequestsTable.requestedModel,
          model: aiAskRequestsTable.responseModel,
          inputTokens: aiAskRequestsTable.inputTokens,
          estimatedCostUsd: aiAskRequestsTable.estimatedCostUsd,
          summaryModel: aiAskRequestsTable.summaryResponseModel,
          summaryInputTokens: aiAskRequestsTable.summaryInputTokens,
          summaryOutputTokens: aiAskRequestsTable.summaryOutputTokens,
          summaryEstimatedCostUsd: aiAskRequestsTable.summaryEstimatedCostUsd,
          createdAt: aiAskRequestsTable.createdAt,
          updatedAt: aiAskRequestsTable.updatedAt,
        })
        .from(aiAskRequestsTable)
        .where(eq(aiAskRequestsTable.userId, userId)),
      db.select().from(aiDailyUsageTable).where(eq(aiDailyUsageTable.userId, userId)),
      db.select().from(aiDailyTendersTable).where(eq(aiDailyTendersTable.userId, userId)),
      db
        .select({
          id: aiJobsTable.id,
          kind: aiJobsTable.kind,
          tenderId: aiJobsTable.tenderId,
          lane: aiJobsTable.lane,
          status: aiJobsTable.status,
          attempts: aiJobsTable.attempts,
          maxAttempts: aiJobsTable.maxAttempts,
          runAfter: aiJobsTable.runAfter,
          lastError: aiJobsTable.lastError,
          createdAt: aiJobsTable.createdAt,
          startedAt: aiJobsTable.startedAt,
          finishedAt: aiJobsTable.finishedAt,
        })
        .from(aiJobsTable)
        .where(eq(aiJobsTable.userId, userId)),
      db.select().from(companyProfilesTable).where(eq(companyProfilesTable.userId, userId)).limit(1),
      db.select({
        tenderId: companyTenderFitsTable.tenderId,
        profileVersion: companyTenderFitsTable.profileVersion,
        status: companyTenderFitsTable.status,
        level: companyTenderFitsTable.level,
        score: companyTenderFitsTable.score,
        reasons: companyTenderFitsTable.reasons,
        model: companyTenderFitsTable.responseModel,
        checkedAt: companyTenderFitsTable.checkedAt,
      }).from(companyTenderFitsTable).where(eq(companyTenderFitsTable.userId, userId)),
      db.select().from(aiFitDailyUsageTable).where(eq(aiFitDailyUsageTable.userId, userId)),
      db.select().from(recommendationEventsTable).where(eq(recommendationEventsTable.userId, userId)),
      db.select().from(recommendationDismissalsTable).where(eq(recommendationDismissalsTable.userId, userId)),
      db.select().from(recommendationInterestProfilesTable).where(eq(recommendationInterestProfilesTable.userId, userId)).limit(1),
      db.select().from(userRecommendationsTable).where(eq(userRecommendationsTable.userId, userId)),
    ]);

  const user = users[0];
  if (!user) throw new NotFoundError("Account was not found");

  return {
    exportedAt: now,
    user,
    sessions,
    savedTenders: savedTenders.map(saved => ({ ...saved, participationSource: 'user' as const })),
    savedSearches,
    notifications,
    emailDeliveries,
    aiQuestions,
    aiDailyUsage,
    aiDailyTenders,
    aiJobs,
    companyProfile: companyProfiles[0] ?? null,
    companyFits,
    fitUsage,
    recommendationEvents,
    recommendationDismissals,
    recommendationInterestProfile: recommendationInterest[0] ?? null,
    recommendations,
    subscription: subscriptions[0] ?? null,
    couponRedemptions,
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
      const [user] = await tx
        .select({
          googleSub: usersTable.googleSub,
          email: usersTable.email,
          trialEndsAt: usersTable.trialEndsAt,
        })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) throw new NotFoundError("Account was not found");
      if (user.googleSub) {
        await tx
          .insert(googleTrialTombstonesTable)
          .values({
            subjectHash: googleTrialSubjectHash(user.googleSub, sessionSecret()),
            trialEndsAt: user.trialEndsAt,
          })
          .onConflictDoNothing();
      }
      await tx
        .delete(betaAccessGrantsTable)
        .where(eq(betaAccessGrantsTable.email, user.email.toLowerCase()));
      await tx.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
      await tx
        .delete(savedTendersTable)
        .where(eq(savedTendersTable.userId, userId));
      await tx
        .delete(savedSearchesTable)
        .where(eq(savedSearchesTable.userId, userId));
      const deliveries = await tx
        .select({ id: emailDeliveriesTable.id })
        .from(emailDeliveriesTable)
        .where(eq(emailDeliveriesTable.userId, userId));
      if (deliveries.length > 0) {
        await tx
          .delete(emailDeliveryNotificationsTable)
          .where(
            inArray(
              emailDeliveryNotificationsTable.deliveryId,
              deliveries.map(({ id }) => id),
            ),
          );
      }
      await tx
        .delete(emailDeliveriesTable)
        .where(eq(emailDeliveriesTable.userId, userId));
      await tx
        .delete(notificationsTable)
        .where(eq(notificationsTable.userId, userId));
      await tx
        .delete(aiAskRequestsTable)
        .where(eq(aiAskRequestsTable.userId, userId));
      await tx
        .delete(aiDailyUsageTable)
        .where(eq(aiDailyUsageTable.userId, userId));
      await tx.delete(aiDailyTendersTable).where(eq(aiDailyTendersTable.userId, userId));
      await tx.delete(aiJobsTable).where(eq(aiJobsTable.userId, userId));
      await tx.delete(companyTenderFitsTable).where(eq(companyTenderFitsTable.userId, userId));
      await tx.delete(aiFitDailyUsageTable).where(eq(aiFitDailyUsageTable.userId, userId));
      await tx.delete(companyProfilesTable).where(eq(companyProfilesTable.userId, userId));
      await tx.delete(userRecommendationsTable).where(eq(userRecommendationsTable.userId, userId));
      await tx.delete(recommendationInterestProfilesTable).where(eq(recommendationInterestProfilesTable.userId, userId));
      await tx.delete(recommendationDismissalsTable).where(eq(recommendationDismissalsTable.userId, userId));
      await tx.delete(recommendationEventsTable).where(eq(recommendationEventsTable.userId, userId));
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
