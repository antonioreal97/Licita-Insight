import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tendersTable } from "./tenders";
import { workspacesTable } from "./workspaces";

export type NotificationChangeRecord = {
  field: string;
  from: string | number | null;
  to: string | number | null;
};

export type ProfileMatchNotificationRecord = {
  id: string;
  title: string;
  organizationName: string;
  proposalDeadline: Date | null;
  level: "high";
};

export const usersTable = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    googleSub: text("google_sub"),
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '7 days'`),
    emailDigest: text("email_digest").notNull().default("daily"),
    emailImmediateCritical: boolean("email_immediate_critical")
      .notNull()
      .default(true),
    profileAlerts: boolean("profile_alerts").notNull().default(true),
    recommendationPersonalizationEnabled: boolean("recommendation_personalization_enabled")
      .notNull()
      .default(false),
    /** Opt-in: international calls only enter profile matching and recommendations when this is on. */
    showInternationalOpportunities: boolean("show_international_opportunities")
      .notNull()
      .default(false),
    recommendationPreferencesUpdatedAt: timestamp(
      "recommendation_preferences_updated_at",
      { withTimezone: true },
    ),
    emailPreferencesUpdatedAt: timestamp("email_preferences_updated_at", {
      withTimezone: true,
    }),
    emailUnsubscribeId: uuid("email_unsubscribe_id").notNull().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_google_sub_uidx")
      .on(table.googleSub)
      .where(sql`${table.googleSub} is not null`),
    uniqueIndex("users_email_uidx").on(table.email),
    uniqueIndex("users_email_unsubscribe_uidx").on(table.emailUnsubscribeId),
    check(
      "users_email_digest_check",
      sql`${table.emailDigest} in ('daily', 'off')`,
    ),
  ],
);

export const googleTrialTombstonesTable = pgTable("google_trial_tombstones", {
  subjectHash: text("subject_hash").primaryKey(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Owner-managed closed-beta grants; deliberately independent from Asaas rows. Emails are stored lowercase so the key is case-insensitive. */
export const betaAccessGrantsTable = pgTable(
  "beta_access_grants",
  {
    email: text("email").primaryKey(),
    accessUntil: timestamp("access_until", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("beta_access_grants_email_lowercase_check", sql`${table.email} = lower(${table.email})`)],
);

export const sessionsTable = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export type ParticipationStage = 'analyzing' | 'participating' | 'submitted' | 'awaiting_result' | 'completed' | 'dismissed';
export type ParticipationChecklistItem = { key: string; state: 'have' | 'missing' | 'unknown'; note: string | null; updatedAt: string };
export type ParticipationTransition = { from: ParticipationStage | null; to: ParticipationStage; at: string; source: 'user' };

export const savedTendersTable = pgTable(
  "saved_tenders",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tendersTable.id, { onDelete: "cascade" }),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    monitored: boolean("monitored").notNull().default(false),
    monitoredAt: timestamp("monitored_at", { withTimezone: true }),
    stage: text("stage").$type<ParticipationStage>().notNull().default('analyzing'),
    stageAt: timestamp("stage_at", { withTimezone: true }).notNull().defaultNow(),
    protocol: text("protocol"),
    nextAction: text("next_action"),
    nextActionDeadline: timestamp("next_action_deadline", { withTimezone: true }),
    checklist: jsonb("checklist").$type<ParticipationChecklistItem[]>().notNull().default([]),
    history: jsonb("history").$type<ParticipationTransition[]>().notNull().default([]),
    workspaceId: text("workspace_id").references(() => workspacesTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.tenderId] }),
    check("saved_tenders_stage_check", sql`${table.stage} in ('analyzing', 'participating', 'submitted', 'awaiting_result', 'completed', 'dismissed')`),
    index("saved_tenders_user_stage_idx").on(table.userId, table.stage),
    index("saved_tenders_user_saved_at_idx").on(table.userId, table.savedAt),
    index("saved_tenders_monitored_tender_idx")
      .on(table.tenderId)
      .where(sql`${table.monitored} = true`),
    index("saved_tenders_workspace_saved_idx").on(table.workspaceId, table.savedAt),
    uniqueIndex("saved_tenders_workspace_tender_uidx").on(table.workspaceId, table.tenderId),
  ],
);

export const savedSearchesTable = pgTable(
  "saved_searches",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    query: text("query").notNull(),
    alertsEnabled: boolean("alerts_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    newMatchesCount: integer("new_matches_count").notNull().default(0),
    workspaceId: text("workspace_id").references(() => workspacesTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("saved_searches_user_updated_at_idx").on(
      table.userId,
      table.updatedAt,
    ),
    index("saved_searches_alerts_idx")
      .on(table.alertsEnabled, table.lastCheckedAt)
      .where(sql`${table.alertsEnabled} = true and ${table.deletedAt} is null`),
    uniqueIndex("saved_searches_user_query_active_uidx")
      .on(table.userId, table.query)
      .where(sql`${table.deletedAt} is null`),
    index("saved_searches_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
    uniqueIndex("saved_searches_workspace_query_active_uidx")
      .on(table.workspaceId, table.query)
      .where(sql`${table.workspaceId} is not null and ${table.deletedAt} is null`),
  ],
);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    tenderId: text("tender_id"),
    tenderTitle: text("tender_title"),
    tenderNumberShort: text("tender_number_short"),
    tenderOrganizationName: text("tender_organization_name"),
    tenderProposalDeadline: timestamp("tender_proposal_deadline", {
      withTimezone: true,
    }),
    change: jsonb("change").$type<NotificationChangeRecord>(),
    savedSearchId: text("saved_search_id"),
    savedSearchName: text("saved_search_name"),
    savedSearchQuery: text("saved_search_query"),
    matchCount: integer("match_count"),
    tenderIds: jsonb("tender_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    profileMatches: jsonb("profile_matches")
      .$type<ProfileMatchNotificationRecord[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    workspaceId: text("workspace_id").references(() => workspacesTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("notifications_user_dedupe_uidx").on(
      table.userId,
      table.dedupeKey,
    ),
    index("notifications_user_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("notifications_user_unread_idx")
      .on(table.userId, table.createdAt)
      .where(sql`${table.readAt} is null`),
    index("notifications_workspace_created_idx").on(table.workspaceId, table.createdAt),
    uniqueIndex("notifications_workspace_dedupe_uidx")
      .on(table.workspaceId, table.dedupeKey)
      .where(sql`${table.workspaceId} is not null`),
    uniqueIndex("notifications_id_workspace_uidx").on(table.id, table.workspaceId),
  ],
);

export const emailDeliveriesTable = pgTable(
  "email_deliveries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("email"),
    mode: text("mode").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    subject: text("subject").notNull(),
    htmlBody: text("html_body").notNull(),
    textBody: text("text_body").notNull(),
    messageHeaders: jsonb("message_headers")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Null for account-only messages; set when the delivery groups resources of one workspace. */
    workspaceId: text("workspace_id").references(() => workspacesTable.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("email_deliveries_dedupe_uidx").on(table.dedupeKey),
    index("email_deliveries_retry_idx").on(table.status, table.nextAttemptAt),
    index("email_deliveries_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("email_deliveries_workspace_created_idx")
      .on(table.workspaceId, table.createdAt)
      .where(sql`${table.workspaceId} is not null`),
    uniqueIndex("email_deliveries_id_workspace_uidx").on(table.id, table.workspaceId),
    uniqueIndex("email_deliveries_workspace_dedupe_uidx")
      .on(table.workspaceId, table.dedupeKey)
      .where(sql`${table.workspaceId} is not null`),
    check("email_deliveries_channel_check", sql`${table.channel} = 'email'`),
    check(
      "email_deliveries_mode_check",
      sql`${table.mode} in ('digest', 'immediate')`,
    ),
    check(
      "email_deliveries_status_check",
      sql`${table.status} in ('queued', 'sent', 'failed', 'skipped')`,
    ),
    check("email_deliveries_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export const emailDeliveryNotificationsTable = pgTable(
  "email_delivery_notifications",
  {
    deliveryId: text("delivery_id")
      .notNull()
      .references(() => emailDeliveriesTable.id, { onDelete: "cascade" }),
    notificationId: text("notification_id")
      .notNull()
      .references(() => notificationsTable.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspacesTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.deliveryId, table.notificationId] }),
    uniqueIndex("email_delivery_notifications_notification_uidx").on(
      table.notificationId,
    ),
    index("email_delivery_notifications_workspace_idx").on(table.workspaceId),
  ],
);

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    asaasCustomerId: text("asaas_customer_id"),
    asaasPaymentLinkId: text("asaas_payment_link_id"),
    asaasCheckoutUrl: text("asaas_checkout_url"),
    asaasSubscriptionId: text("asaas_subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("subscriptions_payment_link_uidx")
      .on(table.asaasPaymentLinkId)
      .where(sql`${table.asaasPaymentLinkId} is not null`),
    uniqueIndex("subscriptions_asaas_subscription_uidx")
      .on(table.asaasSubscriptionId)
      .where(sql`${table.asaasSubscriptionId} is not null`),
    index("subscriptions_asaas_customer_idx").on(table.asaasCustomerId),
  ],
);

/** Owner-issued access coupons. Only a SHA-256 digest is persisted; the code is returned once at creation. */
export const couponCodesTable = pgTable(
  "coupon_codes",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull(),
    codeLast4: text("code_last4").notNull(),
    durationDays: integer("duration_days").notNull(),
    maxRedemptions: integer("max_redemptions").notNull().default(1),
    redeemedCount: integer("redeemed_count").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("coupon_codes_hash_uidx").on(table.codeHash),
    check("coupon_codes_duration_days_check", sql`${table.durationDays} in (7, 30)`),
    check("coupon_codes_max_redemptions_check", sql`${table.maxRedemptions} > 0`),
    check("coupon_codes_redeemed_count_check", sql`${table.redeemedCount} >= 0`),
    check("coupon_codes_redeemed_limit_check", sql`${table.redeemedCount} <= ${table.maxRedemptions}`),
    check("coupon_codes_window_check", sql`${table.expiresAt} is null or ${table.startsAt} is null or ${table.expiresAt} > ${table.startsAt}`),
  ],
);

export const couponRedemptionsTable = pgTable(
  "coupon_redemptions",
  {
    couponId: text("coupon_id")
      .notNull()
      .references(() => couponCodesTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
    accessUntil: timestamp("access_until", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.couponId, table.userId] }),
    index("coupon_redemptions_user_access_idx").on(table.userId, table.accessUntil),
  ],
);
