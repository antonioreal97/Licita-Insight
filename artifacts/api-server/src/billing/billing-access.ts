export const subscriptionStatuses = [
  "pending",
  "active",
  "past_due",
  "canceled",
] as const;

export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export type SubscriptionSnapshot = {
  status: string;
  currentPeriodEnd: Date | null;
};

/** Active, or canceled with the already-paid period still open. */
export function isEntitled(
  row: SubscriptionSnapshot | null,
  now: Date,
): boolean {
  if (!row) return false;
  if (row.status === "active") return true;
  return (
    row.status === "canceled" &&
    row.currentPeriodEnd !== null &&
    row.currentPeriodEnd > now
  );
}

/** Asaas dates are calendar days. The paid period ends at midnight in São Paulo on `nextDueDate`. */
export function periodEndFromAsaasDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid Asaas date: ${value}`);
  }
  const date = new Date(`${value}T00:00:00.000-03:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Asaas date: ${value}`);
  }
  return date;
}
