import { periodEndFromAsaasDate, type SubscriptionSnapshot } from "./billing-access";

const ACTIVATING = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);

export type AsaasPaymentFields = {
  customer?: string | null;
  subscription?: string | null;
  paymentLink?: string | null;
  externalReference?: string | null;
  dueDate?: string | null;
};

export type WebhookPatch = {
  status: "active" | "past_due" | "canceled";
  asaasCustomerId: string | null;
  asaasSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
};

/**
 * Maps an Asaas payment event onto the local subscription.
 * `null` means the event does not change access (unknown event, or an overdue charge older than the period already paid).
 * Activating events require `nextDueDate` (`YYYY-MM-DD` from the Asaas subscription).
 */
export function webhookPatch(
  event: string,
  payment: AsaasPaymentFields,
  nextDueDate: string | null,
  current: SubscriptionSnapshot | null,
): WebhookPatch | null {
  const customerId = text(payment.customer);
  const subscriptionId = text(payment.subscription);

  if (ACTIVATING.has(event)) {
    if (!nextDueDate) {
      throw new Error("Asaas subscription nextDueDate is required to activate");
    }
    return {
      status: "active",
      asaasCustomerId: customerId,
      asaasSubscriptionId: subscriptionId,
      currentPeriodEnd: periodEndFromAsaasDate(nextDueDate),
    };
  }

  if (event === "PAYMENT_OVERDUE") {
    const due = text(payment.dueDate);
    if (
      current?.status === "active" &&
      current.currentPeriodEnd &&
      due &&
      current.currentPeriodEnd > periodEndFromAsaasDate(due)
    ) {
      return null;
    }
    return {
      status: "past_due",
      asaasCustomerId: customerId,
      asaasSubscriptionId: subscriptionId,
      currentPeriodEnd: current?.currentPeriodEnd ?? null,
    };
  }

  if (event === "PAYMENT_REFUNDED") {
    return {
      status: "canceled",
      asaasCustomerId: customerId,
      asaasSubscriptionId: subscriptionId,
      currentPeriodEnd: null,
    };
  }

  return null;
}

const text = (value: string | null | undefined): string | null => {
  const parsed = value?.trim();
  return parsed ? parsed : null;
};
