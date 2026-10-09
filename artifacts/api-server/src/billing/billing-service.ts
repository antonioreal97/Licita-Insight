import { eq, or } from "drizzle-orm";
import { db, subscriptionsTable, usersTable } from "@workspace/db";
import { publicAppOrigin } from "../auth/config";
import {
  BillingUnavailableError,
  ConflictError,
  InvalidParameterError,
} from "../lib/api-error";
import { logger } from "../lib/logger";
import {
  createRecurringPaymentLink,
  deleteSubscription,
  getPaymentLink,
  getSubscription,
  listSubscriptionPayments,
  monthlyAmountBrl,
} from "./asaas-client";
import {
  entitlementSource,
  hasSubscriptionEntitlement,
  type EntitlementSource,
  type SubscriptionStatus,
} from "./billing-access";
import { userHasBetaGrant } from "./beta-grants";
import { activeCouponAccessUntil } from "./coupons";
import { webhookPatch, type AsaasPaymentFields } from "./asaas-webhook";
import { TRIAL_DAYS } from "./trial-access";

const HANDLED = new Set([
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
]);

export type BillingView = {
  status: "none" | SubscriptionStatus;
  entitled: boolean;
  source: EntitlementSource;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  couponAccessUntil: string | null;
  canCancel: boolean;
  monthlyBrl: number | null;
};

type SubscriptionRow = typeof subscriptionsTable.$inferSelect;

export async function getBilling(userId: string): Promise<BillingView> {
  const [row, trialEndsAt, couponAccessUntil] = await Promise.all([
    findByUser(userId),
    findTrialEndsAt(userId),
    activeCouponAccessUntil(userId),
  ]);
  return toView(row, trialEndsAt, await userHasBetaGrant(userId, new Date()), couponAccessUntil);
}

export const getBillingPlan = () => ({
  monthlyBrl: monthlyAmountBrl(),
  trialDays: TRIAL_DAYS,
  currency: "BRL" as const,
});

export async function startCheckout(userId: string): Promise<{ url: string }> {
  const row = await findByUser(userId);
  const now = new Date();
  if (hasSubscriptionEntitlement(row, now)) {
    throw new ConflictError("Subscription is already active", [
      { field: "subscription", issue: "already_active" },
    ]);
  }

  if (row?.status === "past_due" && row.asaasSubscriptionId) {
    try {
      const invoiceUrl = await openInvoice(row.asaasSubscriptionId);
      if (invoiceUrl) return { url: invoiceUrl };
    } catch (error) {
      logger.error({ err: error, userId }, "Failed to open the overdue Asaas invoice");
    }
  }

  if (row?.status === "pending" && row.asaasPaymentLinkId) {
    const link = await getPaymentLink(row.asaasPaymentLinkId).catch((error: unknown) => {
      logger.error({ err: error, userId }, "Failed to reuse Asaas payment link");
      return null;
    });
    if (link && link.deleted !== true && link.active !== false && link.url?.startsWith("https://")) {
      return { url: link.url };
    }
  }

  const link = await createRecurringPaymentLink({
    userId,
    successUrl: `${publicAppOrigin()}/settings?billing=return`,
  });
  const updatedAt = new Date();
  await db
    .insert(subscriptionsTable)
    .values({
      userId,
      status: "pending",
      asaasPaymentLinkId: link.id,
      asaasCheckoutUrl: link.url,
      asaasCustomerId: row?.asaasCustomerId ?? null,
      asaasSubscriptionId: row?.asaasSubscriptionId ?? null,
      currentPeriodEnd: row?.currentPeriodEnd ?? null,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: subscriptionsTable.userId,
      set: {
        status: "pending",
        asaasPaymentLinkId: link.id,
        asaasCheckoutUrl: link.url,
        updatedAt,
      },
    });
  return { url: link.url };
}

export async function cancelSubscription(userId: string): Promise<BillingView> {
  const [row, trialEndsAt, couponAccessUntil] = await Promise.all([
    findByUser(userId),
    findTrialEndsAt(userId),
    activeCouponAccessUntil(userId),
  ]);
  if (!row || (row.status !== "active" && row.status !== "past_due")) {
    throw new ConflictError("There is no subscription to cancel", [
      { field: "subscription", issue: "not_cancelable" },
    ]);
  }
  if (!row.asaasSubscriptionId) {
    throw new BillingUnavailableError(
      "A assinatura ainda não tem um identificador no Asaas para cancelar.",
    );
  }
  await deleteSubscription(row.asaasSubscriptionId);
  const updatedAt = new Date();
  const [saved] = await db
    .update(subscriptionsTable)
    .set({ status: "canceled", updatedAt })
    .where(eq(subscriptionsTable.userId, userId))
    .returning();
  return toView(
    saved ?? { ...row, status: "canceled", updatedAt },
    trialEndsAt,
    await userHasBetaGrant(userId, updatedAt),
    couponAccessUntil,
  );
}

export async function applyAsaasWebhook(body: unknown): Promise<void> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidParameterError("Webhook body must be an object", [
      { field: "body", issue: "invalid_type" },
    ]);
  }
  const event = (body as { event?: unknown }).event;
  if (typeof event !== "string" || !HANDLED.has(event)) return;

  const payment = paymentFields((body as { payment?: unknown }).payment);
  if (!payment) {
    throw new InvalidParameterError("payment is required", [
      { field: "payment", issue: "invalid_type" },
    ]);
  }

  const match = await findWebhookTarget(payment);
  if (!match) {
    logger.error(
      { event, externalReference: payment.externalReference, paymentLink: payment.paymentLink },
      "Asaas webhook did not match a user",
    );
    return;
  }

  let nextDueDate: string | null = null;
  if (
    (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") &&
    payment.subscription
  ) {
    const remote = await getSubscription(payment.subscription);
    nextDueDate = remote.nextDueDate ?? null;
  }

  let patch;
  try {
    patch = webhookPatch(event, payment, nextDueDate, match.row);
  } catch (error) {
    logger.error({ err: error, event, userId: match.userId }, "Asaas webhook could not be applied");
    throw error;
  }
  if (!patch) return;

  const updatedAt = new Date();
  await db
    .insert(subscriptionsTable)
    .values({
      userId: match.userId,
      status: patch.status,
      asaasCustomerId: patch.asaasCustomerId ?? match.row?.asaasCustomerId ?? null,
      asaasSubscriptionId: patch.asaasSubscriptionId ?? match.row?.asaasSubscriptionId ?? null,
      asaasPaymentLinkId: payment.paymentLink ?? match.row?.asaasPaymentLinkId ?? null,
      asaasCheckoutUrl: match.row?.asaasCheckoutUrl ?? null,
      currentPeriodEnd: patch.currentPeriodEnd,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: subscriptionsTable.userId,
      set: {
        status: patch.status,
        asaasCustomerId: patch.asaasCustomerId ?? match.row?.asaasCustomerId ?? null,
        asaasSubscriptionId: patch.asaasSubscriptionId ?? match.row?.asaasSubscriptionId ?? null,
        ...(payment.paymentLink ? { asaasPaymentLinkId: payment.paymentLink } : {}),
        currentPeriodEnd: patch.currentPeriodEnd,
        updatedAt,
      },
    });
}

async function openInvoice(subscriptionId: string): Promise<string | null> {
  const payments = await listSubscriptionPayments(subscriptionId);
  const open = payments.find(
    (payment) =>
      (payment.status === "PENDING" || payment.status === "OVERDUE") &&
      typeof payment.invoiceUrl === "string" &&
      payment.invoiceUrl.startsWith("https://"),
  );
  return open?.invoiceUrl ?? null;
}

async function findByUser(userId: string): Promise<SubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .limit(1);
  return row ?? null;
}

async function findTrialEndsAt(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ trialEndsAt: usersTable.trialEndsAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return row?.trialEndsAt ?? null;
}

async function findWebhookTarget(payment: AsaasPaymentFields): Promise<{
  userId: string;
  row: SubscriptionRow | null;
} | null> {
  const externalReference = payment.externalReference?.trim();
  if (externalReference) {
    const row = await findByUser(externalReference);
    if (row) return { userId: row.userId, row };
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, externalReference))
      .limit(1);
    if (user) return { userId: user.id, row: null };
  }

  const filters = [
    payment.paymentLink
      ? eq(subscriptionsTable.asaasPaymentLinkId, payment.paymentLink)
      : undefined,
    payment.subscription
      ? eq(subscriptionsTable.asaasSubscriptionId, payment.subscription)
      : undefined,
    payment.customer
      ? eq(subscriptionsTable.asaasCustomerId, payment.customer)
      : undefined,
  ].filter((filter) => filter !== undefined);

  if (filters.length === 0) return null;
  const [row] = await db
    .select()
    .from(subscriptionsTable)
    .where(or(...filters))
    .limit(1);
  return row ? { userId: row.userId, row } : null;
}

function paymentFields(value: unknown): AsaasPaymentFields | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payment = value as Record<string, unknown>;
  return {
    customer: optionalString(payment.customer),
    subscription: optionalString(payment.subscription),
    paymentLink: optionalString(payment.paymentLink),
    externalReference: optionalString(payment.externalReference),
    dueDate: optionalString(payment.dueDate),
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toView(
  row: SubscriptionRow | null | undefined,
  trialEndsAt: Date | null,
  betaGrant = false,
  couponAccessUntil: Date | null = null,
): BillingView {
  const now = new Date();
  const status = isStatus(row?.status) ? row.status : "none";
  let source = entitlementSource(
    { status: row?.status ?? null, currentPeriodEnd: row?.currentPeriodEnd ?? null, trialEndsAt },
    now,
    process.env,
    couponAccessUntil,
  );
  if (source === null && betaGrant) source = "beta";
  return {
    status,
    entitled: source !== null,
    source,
    trialEndsAt: trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: row?.currentPeriodEnd?.toISOString() ?? null,
    couponAccessUntil: couponAccessUntil?.toISOString() ?? null,
    canCancel: status === "active" || status === "past_due",
    monthlyBrl: monthlyAmountBrl(),
  };
}

function isStatus(value: string | undefined): value is SubscriptionStatus {
  return (
    value === "pending" ||
    value === "active" ||
    value === "past_due" ||
    value === "canceled"
  );
}
