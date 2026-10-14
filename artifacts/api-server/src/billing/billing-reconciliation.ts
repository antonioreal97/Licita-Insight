import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db, subscriptionsTable } from "@workspace/db";
import { tryRunSingletonJob } from "../jobs/job-lock";
import { logger } from "../lib/logger";
import { millisecondsUntilSaoPauloHour } from "../lib/sao-paulo-schedule";
import {
  AsaasNotFoundError,
  billingConfigured,
  getSubscription,
  listPaymentsByExternalReference,
  listSubscriptionPayments,
  type AsaasInvoice,
  type AsaasSubscription,
} from "./asaas-client";
import { paidPeriodNextDueDate, webhookPatch, type WebhookPatch } from "./asaas-webhook";

type SubscriptionRow = typeof subscriptionsTable.$inferSelect;

export type AsaasReader = {
  getSubscription(id: string): Promise<AsaasSubscription>;
  listSubscriptionPayments(id: string): Promise<AsaasInvoice[]>;
  listPaymentsByExternalReference(reference: string): Promise<AsaasInvoice[]>;
};

export type RemoteSubscription = {
  subscription: AsaasSubscription;
  payments: AsaasInvoice[];
};

const EVENT_BY_PAYMENT_STATUS: Record<string, string> = {
  RECEIVED: "PAYMENT_RECEIVED",
  CONFIRMED: "PAYMENT_CONFIRMED",
  OVERDUE: "PAYMENT_OVERDUE",
  REFUNDED: "PAYMENT_REFUNDED",
};
const BATCH_SIZE = 25;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Replays the latest decided Asaas charge through the webhook rules, then applies the subscription state
 * (removed/inactive without refund → `canceled`, keeping the paid period). `null` = nothing to write.
 */
export function reconcilePatch(
  row: Pick<SubscriptionRow, "status" | "currentPeriodEnd" | "asaasCustomerId" | "asaasSubscriptionId">,
  remote: RemoteSubscription,
): WebhookPatch | null {
  const decided = remote.payments
    .filter((payment) => payment.dueDate && EVENT_BY_PAYMENT_STATUS[payment.status ?? ""])
    .sort((a, b) => b.dueDate!.localeCompare(a.dueDate!));
  const latest = decided[0];
  let patch: WebhookPatch | null = null;
  if (latest) {
    patch = webhookPatch(
      EVENT_BY_PAYMENT_STATUS[latest.status!]!,
      {
        customer: latest.customer ?? remote.subscription.customer ?? null,
        subscription: remote.subscription.id,
        dueDate: latest.dueDate,
      },
      paidPeriodNextDueDate(latest.dueDate, remote.payments, remote.subscription.nextDueDate),
      row,
    );
  }

  const ended =
    remote.subscription.deleted === true ||
    remote.subscription.status === "INACTIVE" ||
    remote.subscription.status === "EXPIRED";
  if (ended && patch?.status !== "canceled") {
    patch = {
      asaasCustomerId: remote.subscription.customer ?? null,
      asaasSubscriptionId: remote.subscription.id,
      currentPeriodEnd: row.currentPeriodEnd,
      ...patch,
      status: "canceled",
    };
  }

  if (!patch) return null;
  // A missing customer id alone is not worth a write; it is filled in with the next real change.
  const unchanged =
    patch.status === row.status &&
    patch.currentPeriodEnd?.getTime() === row.currentPeriodEnd?.getTime() &&
    (patch.asaasSubscriptionId ?? row.asaasSubscriptionId) === row.asaasSubscriptionId;
  return unchanged ? null : patch;
}

/** Pending rows follow the current checkout link; the other rows follow the stored Asaas subscription. */
async function readRemote(
  row: SubscriptionRow,
  reader: AsaasReader,
  pause: () => Promise<void>,
): Promise<RemoteSubscription | null> {
  let subscriptionId = row.status === "pending" ? null : row.asaasSubscriptionId;
  if (row.status === "pending" && row.asaasPaymentLinkId) {
    await pause();
    const payments = await reader.listPaymentsByExternalReference(row.userId);
    subscriptionId =
      payments.find((payment) => payment.paymentLink === row.asaasPaymentLinkId && payment.subscription)
        ?.subscription ?? null;
  }
  if (!subscriptionId) return null;
  await pause();
  const subscription = await reader.getSubscription(subscriptionId);
  await pause();
  const payments = await reader.listSubscriptionPayments(subscriptionId);
  return { subscription, payments };
}

export type BillingReconcileConfig = {
  hour: number;
  maxRows: number;
  pauseMs: number;
};

const integerEnv = (name: string, fallback: number, min: number, max: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}, received "${raw}"`);
  }
  return value;
};

/** The hour stays out of the 00:00–05:30 night window and the 06:00 PNCP collect. */
export const billingReconcileConfig = (): BillingReconcileConfig => ({
  hour: integerEnv("BILLING_RECONCILE_HOUR", 14, 7, 23),
  maxRows: integerEnv("BILLING_RECONCILE_MAX_PER_RUN", 200, 1, 10_000),
  pauseMs: integerEnv("BILLING_RECONCILE_PAUSE_MS", 1_000, 0, 60_000),
});

export type BillingReconcileResult = {
  checked: number;
  unchanged: number;
  unmatched: number;
  /** Asaas answered 404 for the stored subscription; the row is left as is and is not a failure. */
  missingRemote: number;
  failed: number;
  conflicts: number;
  aborted: boolean;
  transitions: Record<string, number>;
  /** Cursor for the next run; `null` once every candidate was visited. */
  nextUserId: string | null;
};

/**
 * Visits subscriptions that may diverge from Asaas (`pending`, `active`, `past_due`, and `canceled` with
 * the paid period still open), one at a time. Asaas failures leave the row untouched for the next run.
 */
export async function reconcileSubscriptions(options: {
  maxRows: number;
  pauseMs: number;
  dryRun?: boolean;
  afterUserId?: string | null;
  reader?: AsaasReader;
  now?: Date;
}): Promise<BillingReconcileResult> {
  const reader: AsaasReader = options.reader ?? {
    getSubscription: (id) => getSubscription(id, { notFoundExpected: true }),
    listSubscriptionPayments: (id) => listSubscriptionPayments(id, { notFoundExpected: true }),
    listPaymentsByExternalReference,
  };
  const now = options.now ?? new Date();
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, options.pauseMs));
  const result: BillingReconcileResult = {
    checked: 0,
    unchanged: 0,
    unmatched: 0,
    missingRemote: 0,
    failed: 0,
    conflicts: 0,
    aborted: false,
    transitions: {},
    nextUserId: null,
  };
  let cursor = options.afterUserId ?? null;
  let consecutiveFailures = 0;

  while (result.checked < options.maxRows) {
    const rows = await db
      .select()
      .from(subscriptionsTable)
      .where(
        and(
          cursor ? gt(subscriptionsTable.userId, cursor) : undefined,
          or(
            inArray(subscriptionsTable.status, ["pending", "active", "past_due"]),
            and(eq(subscriptionsTable.status, "canceled"), gt(subscriptionsTable.currentPeriodEnd, now)),
          ),
        ),
      )
      .orderBy(asc(subscriptionsTable.userId))
      .limit(Math.min(BATCH_SIZE, options.maxRows - result.checked));
    if (rows.length === 0) return result;

    for (const row of rows) {
      cursor = row.userId;
      result.checked += 1;
      let patch: WebhookPatch | null;
      try {
        const remote = await readRemote(row, reader, pause);
        if (!remote) {
          result.unmatched += 1;
          consecutiveFailures = 0;
          continue;
        }
        patch = reconcilePatch(row, remote);
        consecutiveFailures = 0;
      } catch (error) {
        // 404 may mean a wrong environment or key (e.g. sandbox rows after moving to production): never cancel on it.
        if (error instanceof AsaasNotFoundError) {
          result.missingRemote += 1;
          logger.debug({ userId: row.userId, asaasSubscriptionId: row.asaasSubscriptionId }, "Billing reconciliation target missing in Asaas");
          continue;
        }
        result.failed += 1;
        consecutiveFailures += 1;
        // Only the message: provider and driver details can carry Asaas or user identifiers.
        logger.warn(
          { status: row.status, error: error instanceof Error ? error.message : String(error) },
          "Billing reconciliation could not decide; the subscription stays as is until the next run",
        );
        logger.debug({ userId: row.userId, asaasSubscriptionId: row.asaasSubscriptionId }, "Billing reconciliation failure target");
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          result.aborted = true;
          result.nextUserId = cursor;
          return result;
        }
        continue;
      }
      if (!patch) {
        result.unchanged += 1;
        continue;
      }
      if (!options.dryRun) {
        const written = await db
          .update(subscriptionsTable)
          .set({
            status: patch.status,
            asaasCustomerId: patch.asaasCustomerId ?? row.asaasCustomerId,
            asaasSubscriptionId: patch.asaasSubscriptionId ?? row.asaasSubscriptionId,
            currentPeriodEnd: patch.currentPeriodEnd,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(subscriptionsTable.userId, row.userId),
              eq(subscriptionsTable.status, row.status),
              row.currentPeriodEnd
                ? eq(subscriptionsTable.currentPeriodEnd, row.currentPeriodEnd)
                : isNull(subscriptionsTable.currentPeriodEnd),
            ),
          )
          .returning({ userId: subscriptionsTable.userId });
        // A webhook landed between the read and the write; it wins and the next run re-checks.
        if (written.length === 0) {
          result.conflicts += 1;
          continue;
        }
      }
      const transition = `${row.status}->${patch.status}`;
      result.transitions[transition] = (result.transitions[transition] ?? 0) + 1;
    }
    if (result.checked >= options.maxRows) result.nextUserId = cursor;
  }
  return result;
}

/** Daily at `BILLING_RECONCILE_HOUR` (São Paulo), resuming where the previous run stopped. */
export function startBillingReconciliationScheduler(): () => void {
  if (process.env.BILLING_RECONCILE_ENABLED === "false") {
    logger.info("Billing reconciliation is disabled");
    return () => undefined;
  }
  if (!billingConfigured()) {
    logger.info("Billing reconciliation will not start: Asaas is not configured");
    return () => undefined;
  }
  const config = billingReconcileConfig();
  let cursor: string | null = null;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const run = () =>
    tryRunSingletonJob("billing_reconciliation", () =>
      reconcileSubscriptions({ maxRows: config.maxRows, pauseMs: config.pauseMs, afterUserId: cursor }),
    )
      .then((result) => {
        if (!result.acquired) return;
        const { nextUserId, ...summary } = result.value;
        cursor = nextUserId;
        logger.info({ ...summary, complete: nextUserId === null }, "Billing reconciliation completed");
      })
      .catch((error) => logger.error({ err: error }, "Billing reconciliation failed"));
  const arm = () => {
    if (stopped) return;
    const delayMs = millisecondsUntilSaoPauloHour(config.hour);
    logger.info({ hour: config.hour, delayMs }, "Next billing reconciliation scheduled");
    timer = setTimeout(() => {
      void run().finally(arm);
    }, delayMs);
    timer.unref();
  };
  arm();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
