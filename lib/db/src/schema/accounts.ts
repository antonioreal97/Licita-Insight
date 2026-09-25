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

export type NotificationChangeRecord = {
  field: string;
  from: string | number | null;
  to: string | number | null;
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
    emailPreferencesUpdatedAt: timestamp("email_preferences_updated_at", {
      withTimezone: true,
    }),
    emailUnsubscribeId: uuid("email_unsubscribe_id")
      .notNull()
      .defaultRandom(),
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
    check("users_email_digest_check", sql`${table.emailDigest} in ('daily', 'off')`),
  ],
);

export const googleTrialTombstonesTable = pgTable("google_trial_tombstones", {
  subjectHash: text("subject_hash").primaryKey(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.tenderId] }),
    index("saved_tenders_user_saved_at_idx").on(table.userId, table.savedAt),
    index("saved_tenders_monitored_tender_idx")
      .on(table.tenderId)
      .where(sql`${table.monitored} = true`),
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
  },
  (table) => [
    uniqueIndex("email_deliveries_dedupe_uidx").on(table.dedupeKey),
    index("email_deliveries_retry_idx").on(table.status, table.nextAttemptAt),
    index("email_deliveries_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
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
  },
  (table) => [
    primaryKey({ columns: [table.deliveryId, table.notificationId] }),
    uniqueIndex("email_delivery_notifications_notification_uidx").on(
      table.notificationId,
    ),
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
