import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  eq,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  emailDeliveriesTable,
  emailDeliveryNotificationsTable,
  notificationsTable,
  savedTendersTable,
  subscriptionsTable,
  usersTable,
} from "@workspace/db";
import { publicAppOrigin } from "../auth/config";
import { isEntitled } from "../billing/billing-access";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { logger } from "../lib/logger";
import { createUnsubscribeToken } from "./unsubscribe-token";
import {
  renderNotificationEmail,
  type EmailNotificationSnapshot,
} from "./email-template";
import {
  sendWithResend,
  type EmailMessage,
  type EmailSendResult,
} from "./resend-client";

type EmailMode = "digest" | "immediate";
type DeliveryRow = typeof emailDeliveriesTable.$inferSelect;

type Candidate = EmailNotificationSnapshot & {
  userId: string;
  email: string;
  unsubscribeId: string;
  trialEndsAt: Date;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
};

export type EmailJobResult = {
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
};

type SendEmail = (
  message: EmailMessage,
  idempotencyKey: string,
) => Promise<EmailSendResult>;

const emptyResult = (): EmailJobResult => ({
  queued: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
});

const addResult = (target: EmailJobResult, status: EmailSendResult["status"]) => {
  target.queued += 1;
  target[status] += 1;
};

const notificationSelection = {
  id: notificationsTable.id,
  type: notificationsTable.type,
  createdAt: notificationsTable.createdAt,
  tenderId: notificationsTable.tenderId,
  tenderTitle: notificationsTable.tenderTitle,
  tenderOrganizationName: notificationsTable.tenderOrganizationName,
  tenderProposalDeadline: notificationsTable.tenderProposalDeadline,
  change: notificationsTable.change,
  savedSearchName: notificationsTable.savedSearchName,
  savedSearchQuery: notificationsTable.savedSearchQuery,
  matchCount: notificationsTable.matchCount,
  profileMatches: notificationsTable.profileMatches,
  userId: usersTable.id,
  email: usersTable.email,
  unsubscribeId: usersTable.emailUnsubscribeId,
  trialEndsAt: usersTable.trialEndsAt,
  subscriptionStatus: subscriptionsTable.status,
  currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
};

const hasEmailAccess = (candidate: Candidate, now: Date): boolean =>
  candidate.type === "trial_ending" ||
  isEntitled(
    {
      status: candidate.subscriptionStatus,
      currentPeriodEnd: candidate.currentPeriodEnd,
      trialEndsAt: candidate.trialEndsAt,
    },
    now,
  );

const groupByUser = (rows: Candidate[]): Candidate[][] => {
  const grouped = new Map<string, Candidate[]>();
  for (const row of rows) {
    const group = grouped.get(row.userId) ?? [];
    group.push(row);
    grouped.set(row.userId, group);
  }
  return [...grouped.values()];
};

const digestCandidates = async (now: Date): Promise<Candidate[]> => {
  const rows = await db
    .select(notificationSelection)
    .from(notificationsTable)
    .innerJoin(usersTable, eq(usersTable.id, notificationsTable.userId))
    .leftJoin(
      subscriptionsTable,
      eq(subscriptionsTable.userId, usersTable.id),
    )
    .leftJoin(
      emailDeliveryNotificationsTable,
      eq(
        emailDeliveryNotificationsTable.notificationId,
        notificationsTable.id,
      ),
    )
    .where(
      and(
        eq(usersTable.emailDigest, "daily"),
        isNull(emailDeliveryNotificationsTable.notificationId),
        lte(notificationsTable.createdAt, now),
      ),
    )
    .orderBy(asc(notificationsTable.createdAt))
    .limit(5_000);
  return rows.filter((row) => hasEmailAccess(row, now));
};

const immediateCandidates = async (
  now: Date,
  windowMinutes: number,
): Promise<Candidate[]> => {
  const cutoff = new Date(now.getTime() - windowMinutes * 60_000);
  const rows = await db
    .select(notificationSelection)
    .from(notificationsTable)
    .innerJoin(usersTable, eq(usersTable.id, notificationsTable.userId))
    .leftJoin(
      subscriptionsTable,
      eq(subscriptionsTable.userId, usersTable.id),
    )
    .leftJoin(
      emailDeliveryNotificationsTable,
      eq(
        emailDeliveryNotificationsTable.notificationId,
        notificationsTable.id,
      ),
    )
    .leftJoin(
      savedTendersTable,
      and(
        eq(savedTendersTable.userId, notificationsTable.userId),
        eq(savedTendersTable.tenderId, notificationsTable.tenderId),
        eq(savedTendersTable.monitored, true),
      ),
    )
    .where(
      and(
        eq(usersTable.emailImmediateCritical, true),
        isNull(emailDeliveryNotificationsTable.notificationId),
        lte(notificationsTable.createdAt, cutoff),
        or(
          eq(notificationsTable.type, "trial_ending"),
          and(
            eq(notificationsTable.type, "tender_deadline_changed"),
            isNotNull(savedTendersTable.userId),
          ),
          and(
            eq(notificationsTable.type, "tender_status_changed"),
            isNotNull(savedTendersTable.userId),
            sql`${notificationsTable.change}->>'to' in ('suspended', 'cancelled')`,
          ),
        ),
      ),
    )
    .orderBy(asc(notificationsTable.createdAt))
    .limit(5_000);
  return rows.filter((row) => hasEmailAccess(row, now));
};

const digestKey = (userId: string, now: Date): string =>
  `email:digest:${userId}:${dateInSaoPaulo(now)}`;

const immediateKey = (userId: string, notificationIds: string[]): string => {
  const hash = createHash("sha256")
    .update([...notificationIds].sort().join("|"))
    .digest("hex")
    .slice(0, 24);
  return `email:immediate:${userId}:${hash}`;
};

const queueDelivery = async (
  mode: EmailMode,
  candidates: Candidate[],
  dedupeKey: string,
  now: Date,
): Promise<DeliveryRow | null> => {
  if (candidates.length === 0) return null;
  return db.transaction(async (tx) => {
    const id = randomUUID();
    const [created] = await tx
      .insert(emailDeliveriesTable)
      .values({
        id,
        userId: candidates[0]!.userId,
        mode,
        dedupeKey,
        recipientEmail: candidates[0]!.email,
        subject: "",
        htmlBody: "",
        textBody: "",
        messageHeaders: {},
        nextAttemptAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) return null;

    const linked = await tx
      .insert(emailDeliveryNotificationsTable)
      .values(
        candidates.map((candidate) => ({
          deliveryId: id,
          notificationId: candidate.id,
        })),
      )
      .onConflictDoNothing()
      .returning({ notificationId: emailDeliveryNotificationsTable.notificationId });
    if (linked.length === 0) {
      await tx.delete(emailDeliveriesTable).where(eq(emailDeliveriesTable.id, id));
      return null;
    }

    const linkedIds = new Set(linked.map(({ notificationId }) => notificationId));
    const notifications = candidates.filter(({ id: notificationId }) =>
      linkedIds.has(notificationId),
    );
    const rendered = renderNotificationEmail({
      mode,
      notifications,
      origin: publicAppOrigin(),
      unsubscribeToken: createUnsubscribeToken(candidates[0]!.unsubscribeId),
    });
    const [delivery] = await tx
      .update(emailDeliveriesTable)
      .set({
        subject: rendered.subject,
        htmlBody: rendered.html,
        textBody: rendered.text,
        messageHeaders: rendered.headers,
        updatedAt: now,
      })
      .where(eq(emailDeliveriesTable.id, id))
      .returning();
    return delivery ?? null;
  });
};

const retryDelay = (attempts: number): number => {
  const minutes = [1, 5, 30];
  return (minutes[Math.min(attempts - 1, minutes.length - 1)] ?? 30) * 60_000;
};

const deliver = async (
  delivery: DeliveryRow,
  now: Date,
  sendEmail: SendEmail,
): Promise<EmailSendResult> => {
  const result = await sendEmail(
    {
      to: delivery.recipientEmail,
      subject: delivery.subject,
      html: delivery.htmlBody,
      text: delivery.textBody,
      headers: delivery.messageHeaders,
    },
    delivery.dedupeKey,
  );
  const attempts =
    result.status === "skipped" ? delivery.attempts : delivery.attempts + 1;
  await db
    .update(emailDeliveriesTable)
    .set({
      status: result.status,
      attempts,
      providerMessageId:
        result.status === "sent" ? result.providerMessageId : null,
      lastError: result.status === "sent" ? null : result.reason.slice(0, 1_000),
      sentAt: result.status === "sent" ? now : null,
      nextAttemptAt:
        result.status === "failed" && result.retryable && attempts < 3
          ? new Date(now.getTime() + retryDelay(attempts))
          : null,
      updatedAt: now,
    })
    .where(eq(emailDeliveriesTable.id, delivery.id));
  return result;
};

const queueGroups = async (
  mode: EmailMode,
  groups: Candidate[][],
  now: Date,
  sendEmail: SendEmail,
): Promise<EmailJobResult> => {
  const result = emptyResult();
  for (const group of groups) {
    const candidates = mode === "digest" ? group.slice(0, 100) : group;
    const key =
      mode === "digest"
        ? digestKey(candidates[0]!.userId, now)
        : immediateKey(
            candidates[0]!.userId,
            candidates.map(({ id }) => id),
          );
    const delivery = await queueDelivery(mode, candidates, key, now);
    if (!delivery) continue;
    const sent = await deliver(delivery, now, sendEmail);
    addResult(result, sent.status);
  }
  return result;
};

export const runDailyEmailDigest = async (
  now = new Date(),
  sendEmail: SendEmail = (message, key) => sendWithResend(message, key),
): Promise<EmailJobResult> => {
  const result = await queueGroups(
    "digest",
    groupByUser(await digestCandidates(now)),
    now,
    sendEmail,
  );
  await db
    .delete(emailDeliveriesTable)
    .where(
      lt(
        emailDeliveriesTable.createdAt,
        new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000),
      ),
    );
  return result;
};

export const runImmediateEmailAlerts = async (
  now = new Date(),
  options: { windowMinutes?: number; sendEmail?: SendEmail } = {},
): Promise<EmailJobResult> =>
  queueGroups(
    "immediate",
    groupByUser(
      await immediateCandidates(now, options.windowMinutes ?? 10),
    ),
    now,
    options.sendEmail ?? ((message, key) => sendWithResend(message, key)),
  );

export const retryEmailDeliveries = async (
  now = new Date(),
  sendEmail: SendEmail = (message, key) => sendWithResend(message, key),
): Promise<EmailJobResult> => {
  const deliveries = await db
    .select()
    .from(emailDeliveriesTable)
    .where(
      or(
        and(
          eq(emailDeliveriesTable.status, "queued"),
          lte(emailDeliveriesTable.nextAttemptAt, now),
        ),
        and(
          eq(emailDeliveriesTable.status, "failed"),
          lte(emailDeliveriesTable.nextAttemptAt, now),
          lt(emailDeliveriesTable.attempts, 3),
        ),
      ),
    )
    .orderBy(asc(emailDeliveriesTable.nextAttemptAt))
    .limit(100);
  const result = emptyResult();
  for (const delivery of deliveries) {
    const sent = await deliver(delivery, now, sendEmail);
    addResult(result, sent.status);
  }
  return result;
};

export const logEmailJobResult = (
  operation: string,
  result: EmailJobResult,
  startedAt: number,
) => {
  logger.info(
    { operation, ...result, durationMs: Date.now() - startedAt },
    "Email notification job completed",
  );
};
