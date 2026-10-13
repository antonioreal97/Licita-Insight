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
import {
  CutoverModeChangedError,
  withCutoverGate,
  type GateTransaction,
} from "../workspaces/cutover-gate";
import {
  cycleCaller,
  discardedByCutover,
  startCutoverCycle,
  type CutoverCycle,
} from "../workspaces/cutover-cycle";
import { defaultWorkspaceId } from "../workspaces/workspace-service";

type EmailMode = "digest" | "immediate";
type DeliveryRow = typeof emailDeliveriesTable.$inferSelect;

type Recipient = {
  userId: string;
  email: string;
  unsubscribeId: string;
};

type Candidate = EmailNotificationSnapshot & Recipient & {
  workspaceId: string | null;
  trialEndsAt: Date;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  couponAccessUntil: Date | null;
};

/** One e-mail: a recipient and, in `workspaces` mode, the workspace its notifications and deadlines belong to. */
type EmailGroup = {
  recipient: Recipient;
  workspaceId: string | null;
  notifications: Candidate[];
  deadlines: EmailDeadlineSnapshot[];
};

/**
 * In `legacy` an e-mail groups what belongs to the account. In `workspaces` it groups by recipient and workspace; a
 * row still without a workspace joins the default one, so nothing is left out or sent in a second e-mail.
 */
const groupWorkspace = (cycle: CutoverCycle, userId: string, workspaceId: string | null): string | null =>
  cycle.mode === "legacy" ? null : (workspaceId ?? defaultWorkspaceId(userId));

const groupKey = (userId: string, workspaceId: string | null): string =>
  workspaceId === null ? userId : `${userId}:${workspaceId}`;

/** Until W4 the default workspace keeps the legacy key text, so a delivery made in one mode still dedupes in the other. */
const scopedDedupeKey = (legacyKey: string, group: EmailGroup): string =>
  group.workspaceId === null || group.workspaceId === defaultWorkspaceId(group.recipient.userId)
    ? legacyKey
    : `${legacyKey}:${group.workspaceId}`;

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
  workspaceId: notificationsTable.workspaceId,
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

const groupByRecipient = (
  cycle: CutoverCycle,
  rows: Candidate[],
  deadlines: Map<string, EmailGroup> = new Map(),
): EmailGroup[] => {
  const grouped = new Map<string, EmailGroup>();
  for (const row of rows) {
    const workspaceId = groupWorkspace(cycle, row.userId, row.workspaceId);
    const key = groupKey(row.userId, workspaceId);
    const group = grouped.get(key) ?? {
      recipient: { userId: row.userId, email: row.email, unsubscribeId: row.unsubscribeId },
      workspaceId,
      notifications: [],
      deadlines: deadlines.get(key)?.deadlines ?? [],
    };
    group.notifications.push(row);
    grouped.set(key, group);
  }
  for (const [key, group] of deadlines) {
    if (!grouped.has(key)) grouped.set(key, group);
  }
  return [...grouped.values()];
};

/**
 * "Seus prazos": saved tenders in a personal stage (analyzing/participating) whose personal
 * `nextActionDeadline` or official proposal deadline falls between now and the end of the
 * 3rd following day in Brasília. Same preference and access gate as the digest.
 */
const digestDeadlines = async (
  cycle: CutoverCycle,
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
      workspaceId: savedTendersTable.workspaceId,
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
    const workspaceId = groupWorkspace(cycle, row.userId, row.workspaceId);
    const key = groupKey(row.userId, workspaceId);
    const group = grouped.get(key) ?? {
      recipient: { userId: row.userId, email: row.email, unsubscribeId: row.unsubscribeId },
      workspaceId,
      notifications: [],
      deadlines: [],
    };
    const deadline = deadlineForSavedTender(row, now);
    if (deadline) group.deadlines.push(deadline);
    grouped.set(key, group);
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
  cycle: CutoverCycle,
  mode: EmailMode,
  group: EmailGroup,
  dedupeKey: string,
  now: Date,
): Promise<DeliveryRow | null> => {
  const { recipient, notifications: candidates, deadlines } = group;
  if (candidates.length === 0 && deadlines.length === 0) return null;
  // The delivery and its links carry the same workspace, so one can never point across workspaces.
  const workspace = group.workspaceId === null ? {} : { workspaceId: group.workspaceId };
  return withCutoverGate(cycleCaller(cycle), async (tx) => {
    const id = randomUUID();
    const [created] = await tx
      .insert(emailDeliveriesTable)
      .values({
        id,
        userId: recipient.userId,
        ...workspace,
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
                ...workspace,
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

/**
 * What happened to a send must be recorded, or the retry job would send the same e-mail again. The row is the same
 * in both models, so when the cutover switched the mode between the send and this write, it is written in the mode
 * the gate now finds; the cycle itself still stops at its next step.
 */
const recordDelivery = async (
  cycle: CutoverCycle,
  write: (tx: GateTransaction) => Promise<unknown>,
): Promise<void> => {
  try {
    await withCutoverGate(cycleCaller(cycle), write);
  } catch (error) {
    if (!(error instanceof CutoverModeChangedError)) throw error;
    await withCutoverGate({ kind: "job", cycleMode: error.currentMode }, write);
  }
};

const deliver = async (
  cycle: CutoverCycle,
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
  await recordDelivery(cycle, (tx) =>
    tx
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
      .where(eq(emailDeliveriesTable.id, delivery.id)),
  );
  return result;
};

/**
 * Queues and sends one e-mail per group, adding to `result`. A delivery queued but not sent because the cycle was
 * interrupted keeps its `next_attempt_at` and goes out with the retries; what was not queued yet is still unlinked
 * and the next cycle picks it up. Either way each notification is e-mailed once.
 */
const queueGroups = async (
  cycle: CutoverCycle,
  mode: EmailMode,
  groups: EmailGroup[],
  now: Date,
  sendEmail: SendEmail,
  result: EmailJobResult,
): Promise<void> => {
  for (const group of groups) {
    const candidates =
      mode === "digest" ? group.notifications.slice(0, 100) : group.notifications;
    const key = scopedDedupeKey(
      mode === "digest"
        ? digestKey(group.recipient.userId, now)
        : immediateKey(
            group.recipient.userId,
            candidates.map(({ id }) => id),
          ),
      group,
    );
    const delivery = await queueDelivery(
      cycle,
      mode,
      { ...group, notifications: candidates },
      key,
      now,
    );
    if (!delivery) continue;
    const sent = await deliver(cycle, delivery, now, sendEmail);
    addResult(result, sent.status);
  }
};

/**
 * One e-mail job run is one cutover cycle: it does not start while writes are paused, and when the cutover
 * interrupts it, it stops with what it already sent.
 */
const runEmailCycle = async (
  operation: string,
  run: (cycle: CutoverCycle, result: EmailJobResult) => Promise<void>,
): Promise<EmailJobResult> => {
  const result = emptyResult();
  const cycle = await startCutoverCycle(operation);
  if (!cycle) return result;
  try {
    await run(cycle, result);
  } catch (error) {
    if (!discardedByCutover(error, operation)) throw error;
  }
  return result;
};

export const runDailyEmailDigest = async (
  now = new Date(),
  sendEmail: SendEmail = sendWithEmailProvider,
): Promise<EmailJobResult> =>
  runEmailCycle("email_digest", async (cycle, result) => {
    const betaEmails = await activeBetaGrantEmails(now);
    await queueGroups(
      cycle,
      "digest",
      groupByRecipient(
        cycle,
        await digestCandidates(now, betaEmails),
        await digestDeadlines(cycle, now, betaEmails),
      ),
      now,
      sendEmail,
      result,
    );
    await withCutoverGate(cycleCaller(cycle), (tx) =>
      tx
        .delete(emailDeliveriesTable)
        .where(
          lt(
            emailDeliveriesTable.createdAt,
            new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000),
          ),
        ),
    );
  });

export const runImmediateEmailAlerts = async (
  now = new Date(),
  options: { windowMinutes?: number; sendEmail?: SendEmail } = {},
): Promise<EmailJobResult> =>
  runEmailCycle("email_immediate", async (cycle, result) =>
    queueGroups(
      cycle,
      "immediate",
      groupByRecipient(cycle, await immediateCandidates(now, options.windowMinutes ?? 10)),
      now,
      options.sendEmail ?? sendWithEmailProvider,
      result,
    ),
  );

export const retryEmailDeliveries = async (
  now = new Date(),
  sendEmail: SendEmail = sendWithEmailProvider,
): Promise<EmailJobResult> =>
  runEmailCycle("email_retry", async (cycle, result) => {
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
    for (const delivery of deliveries) {
      const sent = await deliver(cycle, delivery, now, sendEmail);
      addResult(result, sent.status);
    }
  });

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
