import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  couponCodesTable,
  couponRedemptionsTable,
  emailDeliveriesTable,
  emailDeliveryNotificationsTable,
  notificationsTable,
  savedTendersTable,
  subscriptionsTable,
  tendersTable,
  usersTable,
} from "@workspace/db";
import { publicAppOrigin } from "../auth/config";
import { isEntitled } from "../billing/billing-access";
import { activeBetaGrantEmails } from "../billing/beta-grants";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { logger } from "../lib/logger";
import { createUnsubscribeToken } from "./unsubscribe-token";
import {
  DIGEST_DEADLINE_STAGES,
  INACTIVE_TENDER_STATUSES,
  deadlineForSavedTender,
  digestDeadlineWindowEnd,
  sortDeadlines,
  type EmailDeadlineSnapshot,
} from "./digest-deadlines";
import {
  renderNotificationEmail,
  type EmailNotificationSnapshot,
} from "./email-template";
import type { EmailMessage, EmailSendResult, SendEmail } from "./email-client";
import { sendWithEmailProvider } from "./email-provider";

type EmailMode = "digest" | "immediate";
type DeliveryRow = typeof emailDeliveriesTable.$inferSelect;

type Recipient = {
  userId: string;
  email: string;
  unsubscribeId: string;
};

type Candidate = EmailNotificationSnapshot & Recipient & {
  trialEndsAt: Date;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  couponAccessUntil: Date | null;
};

type EmailGroup = {
  recipient: Recipient;
  notifications: Candidate[];
  deadlines: EmailDeadlineSnapshot[];
};

export type EmailJobResult = {
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
};

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
  couponAccessUntil: sql<Date | null>`(
    select max(${couponRedemptionsTable.accessUntil})
    from ${couponRedemptionsTable}
    inner join ${couponCodesTable} on ${couponCodesTable.id} = ${couponRedemptionsTable.couponId}
    where ${couponRedemptionsTable.userId} = ${usersTable.id}
      and ${couponCodesTable.revokedAt} is null
  )`,
};

/** `betaEmails` comes lowercased from activeBetaGrantEmails, loaded once per job run. */
export const hasEmailAccess = (
  candidate: Pick<Candidate, "type" | "email" | "subscriptionStatus" | "currentPeriodEnd" | "trialEndsAt" | "couponAccessUntil">,
  now: Date,
  betaEmails: ReadonlySet<string>,
): boolean =>
  betaEmails.has(candidate.email.toLowerCase()) ||
  isEntitled(
    {
      status: candidate.subscriptionStatus,
      currentPeriodEnd: candidate.currentPeriodEnd,
      trialEndsAt: candidate.trialEndsAt,
    },
    now,
    process.env,
    candidate.couponAccessUntil,
  );

const groupByUser = (
  rows: Candidate[],
  deadlines: Map<string, EmailGroup> = new Map(),
): EmailGroup[] => {
  const grouped = new Map<string, EmailGroup>();
  for (const row of rows) {
    const group = grouped.get(row.userId) ?? {
      recipient: { userId: row.userId, email: row.email, unsubscribeId: row.unsubscribeId },
      notifications: [],
      deadlines: deadlines.get(row.userId)?.deadlines ?? [],
    };
    group.notifications.push(row);
    grouped.set(row.userId, group);
  }
  for (const [userId, group] of deadlines) {
    if (!grouped.has(userId)) grouped.set(userId, group);
  }
  return [...grouped.values()];
};

/**
 * "Seus prazos": saved tenders in a personal stage (analyzing/participating) whose personal
 * `nextActionDeadline` or official proposal deadline falls between now and the end of the
 * 3rd following day in Brasília. Same preference and access gate as the digest.
 */
const digestDeadlines = async (
  now: Date,
  betaEmails: ReadonlySet<string>,
): Promise<Map<string, EmailGroup>> => {
  const end = digestDeadlineWindowEnd(now);
  const rows = await db
    .select({
      userId: usersTable.id,
      email: usersTable.email,
      unsubscribeId: usersTable.emailUnsubscribeId,
      trialEndsAt: usersTable.trialEndsAt,
      subscriptionStatus: subscriptionsTable.status,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
      couponAccessUntil: sql<Date | null>`(
        select max(${couponRedemptionsTable.accessUntil})
        from ${couponRedemptionsTable}
        inner join ${couponCodesTable} on ${couponCodesTable.id} = ${couponRedemptionsTable.couponId}
        where ${couponRedemptionsTable.userId} = ${usersTable.id}
          and ${couponCodesTable.revokedAt} is null
      )`,
      tenderId: tendersTable.id,
      tenderTitle: tendersTable.title,
      tenderOrganizationName: tendersTable.organizationName,
      tenderStatus: tendersTable.status,
      proposalDeadline: tendersTable.proposalDeadline,
      stage: savedTendersTable.stage,
      nextAction: savedTendersTable.nextAction,
      nextActionDeadline: savedTendersTable.nextActionDeadline,
    })
    .from(savedTendersTable)
    .innerJoin(usersTable, eq(usersTable.id, savedTendersTable.userId))
    .innerJoin(tendersTable, eq(tendersTable.id, savedTendersTable.tenderId))
    .leftJoin(
      subscriptionsTable,
      eq(subscriptionsTable.userId, usersTable.id),
    )
    .where(
      and(
        eq(usersTable.emailDigest, "daily"),
        inArray(savedTendersTable.stage, [...DIGEST_DEADLINE_STAGES]),
        or(
          and(
            gt(savedTendersTable.nextActionDeadline, now),
            lt(savedTendersTable.nextActionDeadline, end),
          ),
          and(
            gt(tendersTable.proposalDeadline, now),
            lt(tendersTable.proposalDeadline, end),
            notInArray(tendersTable.status, [...INACTIVE_TENDER_STATUSES]),
          ),
        ),
      ),
    )
    .orderBy(asc(usersTable.id))
    .limit(20_000);
  const grouped = new Map<string, EmailGroup>();
  for (const row of rows) {
    if (!hasEmailAccess({ ...row, type: "digest_deadline" }, now, betaEmails)) continue;
    const group = grouped.get(row.userId) ?? {
      recipient: { userId: row.userId, email: row.email, unsubscribeId: row.unsubscribeId },
      notifications: [],
      deadlines: [],
    };
    const deadline = deadlineForSavedTender(row, now);
    if (deadline) group.deadlines.push(deadline);
    grouped.set(row.userId, group);
  }
  for (const group of grouped.values()) group.deadlines = sortDeadlines(group.deadlines);
  return grouped;
};

const digestCandidates = async (
  now: Date,
  betaEmails: ReadonlySet<string>,
): Promise<Candidate[]> => {
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
        // Avisos de assinatura (fim do teste) ficam só no app: e-mail é para monitoramento e alertas.
        ne(notificationsTable.type, "trial_ending"),
        isNull(emailDeliveryNotificationsTable.notificationId),
        lte(notificationsTable.createdAt, now),
      ),
    )
    .orderBy(asc(notificationsTable.createdAt))
    .limit(5_000);
  return rows.filter((row) => hasEmailAccess(row, now, betaEmails));
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
  const betaEmails = await activeBetaGrantEmails(now);
  return rows.filter((row) => hasEmailAccess(row, now, betaEmails));
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
  group: EmailGroup,
  dedupeKey: string,
  now: Date,
): Promise<DeliveryRow | null> => {
  const { recipient, notifications: candidates, deadlines } = group;
  if (candidates.length === 0 && deadlines.length === 0) return null;
  return db.transaction(async (tx) => {
    const id = randomUUID();
    const [created] = await tx
      .insert(emailDeliveriesTable)
      .values({
        id,
        userId: recipient.userId,
        mode,
        dedupeKey,
        recipientEmail: recipient.email,
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

    const linked =
      candidates.length === 0
        ? []
        : await tx
            .insert(emailDeliveryNotificationsTable)
            .values(
              candidates.map((candidate) => ({
                deliveryId: id,
                notificationId: candidate.id,
              })),
            )
            .onConflictDoNothing()
            .returning({ notificationId: emailDeliveryNotificationsTable.notificationId });
    if (linked.length === 0 && deadlines.length === 0) {
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
      deadlines,
      now,
      origin: publicAppOrigin(),
      unsubscribeToken: createUnsubscribeToken(recipient.unsubscribeId),
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
  groups: EmailGroup[],
  now: Date,
  sendEmail: SendEmail,
): Promise<EmailJobResult> => {
  const result = emptyResult();
  for (const group of groups) {
    const candidates =
      mode === "digest" ? group.notifications.slice(0, 100) : group.notifications;
    const key =
      mode === "digest"
        ? digestKey(group.recipient.userId, now)
        : immediateKey(
            group.recipient.userId,
            candidates.map(({ id }) => id),
          );
    const delivery = await queueDelivery(
      mode,
      { ...group, notifications: candidates },
      key,
      now,
    );
    if (!delivery) continue;
    const sent = await deliver(delivery, now, sendEmail);
    addResult(result, sent.status);
  }
  return result;
};

export const runDailyEmailDigest = async (
  now = new Date(),
  sendEmail: SendEmail = sendWithEmailProvider,
): Promise<EmailJobResult> => {
  const betaEmails = await activeBetaGrantEmails(now);
  const result = await queueGroups(
    "digest",
    groupByUser(
      await digestCandidates(now, betaEmails),
      await digestDeadlines(now, betaEmails),
    ),
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
    groupByUser(await immediateCandidates(now, options.windowMinutes ?? 10)),
    now,
    options.sendEmail ?? sendWithEmailProvider,
  );

export const retryEmailDeliveries = async (
  now = new Date(),
  sendEmail: SendEmail = sendWithEmailProvider,
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
